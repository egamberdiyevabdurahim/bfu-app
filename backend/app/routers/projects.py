import datetime as dt

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.services.notify import esc, send_telegram
from app.database import get_db
from app.models.project import (
    Project,
    ProjectApplication,
    ProjectMember,
    ProjectReqKnowledge,
    ProjectReqRegion,
    ProjectReqSkill,
)
from app.models.user import User, Favorite
from app.schemas.project import (
    ApplicationOut,
    ApplicantPublic,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])



# Inline Pydantic model for review action body
from pydantic import BaseModel as _BM
class _ReviewBody(_BM):
    action: str  # accept | decline

# ── Eager-load options ─────────────────────────────────────────────────────────

# Full graph for GET /projects/{id} and after-mutation reloads.
_PROJECT_OPTIONS = [
    selectinload(Project.members).selectinload(ProjectMember.user),
    selectinload(Project.req_regions),
    selectinload(Project.req_skills),
    selectinload(Project.req_knowledges),
    selectinload(Project.applications),
]

# Slim graph for LIST endpoints — drops the relationships that grow without
# bound (members→user, applications) and that the frontend cards don't read.
# Per-page aggregates (member_count, my_application_status) are computed via
# two grouped subqueries instead.
_PROJECT_LIST_OPTIONS = [
    selectinload(Project.req_regions),
    selectinload(Project.req_skills),
    selectinload(Project.req_knowledges),
]


async def _bulk_list_extras(
    db: AsyncSession, project_ids: list[int], current_user_id: int,
) -> tuple[dict[int, int], dict[int, str]]:
    """One grouped query for member counts, one for the caller's own
    application statuses. Returns (member_count_by_pid, my_status_by_pid)."""
    if not project_ids:
        return {}, {}
    mc_rows = (await db.execute(
        select(ProjectMember.project_id, func.count(ProjectMember.user_id))
        .where(ProjectMember.project_id.in_(project_ids))
        .group_by(ProjectMember.project_id)
    )).all()
    member_count = {pid: cnt for pid, cnt in mc_rows}
    my_rows = (await db.execute(
        select(ProjectApplication.project_id, ProjectApplication.status)
        .where(
            ProjectApplication.project_id.in_(project_ids),
            ProjectApplication.applicant_id == current_user_id,
        )
    )).all()
    my_status = {pid: status for pid, status in my_rows}
    return member_count, my_status

# ── Helpers ────────────────────────────────────────────────────────────────────

async def _set_requirements(
    db: AsyncSession,
    project: Project,
    req_region_ids: list[int],
    req_skills: list[str],
    req_knowledges: list[str],
) -> None:
    await db.execute(delete(ProjectReqRegion).where(ProjectReqRegion.project_id == project.id))
    await db.execute(delete(ProjectReqSkill).where(ProjectReqSkill.project_id == project.id))
    await db.execute(delete(ProjectReqKnowledge).where(ProjectReqKnowledge.project_id == project.id))
    for rid in req_region_ids:
        db.add(ProjectReqRegion(project_id=project.id, region_id=rid))
    for s in req_skills:
        db.add(ProjectReqSkill(project_id=project.id, skill_name=s))
    for k in req_knowledges:
        db.add(ProjectReqKnowledge(project_id=project.id, knowledge_name=k))


def _project_response(project: Project, current_user: User | None = None, fav_set: set | None = None) -> ProjectResponse:
    is_member = False
    is_fit = True
    my_application_status = None

    if current_user:
        is_member = any(m.user_id == current_user.id for m in project.members)

        # My application status
        my_app = next(
            (a for a in project.applications if a.applicant_id == current_user.id), None
        )
        if my_app:
            my_application_status = my_app.status

        # Check Gender Fit
        if project.gender_req and project.gender_req != "Any":
            if current_user.gender != project.gender_req:
                is_fit = False

        # Check Age Fit
        if project.age_from or project.age_to:
            if not current_user.birth_year:
                is_fit = False
            else:
                age = dt.datetime.now().year - current_user.birth_year
                if project.age_from and age < project.age_from:
                    is_fit = False
                if project.age_to and age > project.age_to:
                    is_fit = False

        # Check Region Fit
        if project.req_regions:
            if current_user.region_id not in [r.region_id for r in project.req_regions]:
                is_fit = False

    computed_fields = {"is_member", "is_fit", "member_count",
                       "my_application_status", "members",
                       "pending_applications_count"}
    orm_data = {
        c: getattr(project, c)
        for c in ProjectResponse.model_fields
        if c not in computed_fields and hasattr(project, c)
    }

    pending_count = sum(
        1 for a in (project.applications or []) if a.status == "pending"
    )

    # Build member list with display_name
    from app.schemas.project import MemberOut
    members_out = []
    for m in project.members:
        dname = ""
        if hasattr(m, "user") and m.user:
            dname = m.user.display_name or f"User #{m.user_id}"
        else:
            dname = f"User #{m.user_id}"
        members_out.append(MemberOut(
            user_id=m.user_id,
            joined_at=m.joined_at,
            display_name=dname,
        ))

    return ProjectResponse(
        **orm_data,
        members=members_out,
        member_count=len(project.members),
        pending_applications_count=pending_count,
        is_favorited=bool(fav_set and project.id in fav_set),
        is_member=is_member,
        is_fit=is_fit,
        my_application_status=my_application_status,
    )


async def _load_fav_set(db: AsyncSession, user_id: int) -> set[int]:
    rows = await db.execute(select(Favorite.project_id).where(Favorite.user_id == user_id))
    return set(rows.scalars().all())


def _project_list_response(
    project: Project,
    current_user: User | None,
    member_count: int,
    my_application_status: str | None,
    fav_set: set | None = None,
) -> ProjectResponse:
    """Slim card payload — no `members` list, no pending count, no past
    applications. Server-coalesces `goal` ?? `about[:200]` so frontend's
    `goal || about` fallback keeps showing something on cards with no goal."""
    is_member = False
    is_fit = True
    if current_user:
        # member fit comes from the precomputed member_count check below;
        # we still need to know if THIS user is in it for the badge state.
        # Cheap: my_application_status == "accepted" implies membership.
        is_member = my_application_status == "accepted"
        if project.gender_req and project.gender_req != "Any":
            if current_user.gender != project.gender_req:
                is_fit = False
        if project.age_from or project.age_to:
            if not current_user.birth_year:
                is_fit = False
            else:
                age = dt.datetime.now().year - current_user.birth_year
                if project.age_from and age < project.age_from:
                    is_fit = False
                if project.age_to and age > project.age_to:
                    is_fit = False
        if project.req_regions:
            if current_user.region_id not in [r.region_id for r in project.req_regions]:
                is_fit = False

    computed_fields = {"is_member", "is_fit", "member_count",
                       "my_application_status", "members",
                       "pending_applications_count", "is_favorited", "goal", "about"}
    orm_data = {
        c: getattr(project, c)
        for c in ProjectResponse.model_fields
        if c not in computed_fields and hasattr(project, c)
    }

    # Frontend cards render `goal || about` (StartupScreen.jsx:275 et al), so
    # coalesce on the server. `about` is dropped from the slim payload to keep
    # the card response tight.
    goal_text = project.goal or (project.about[:200] if project.about else None)

    return ProjectResponse(
        **orm_data,
        goal=goal_text,
        about=None,
        members=[],
        member_count=member_count,
        pending_applications_count=0,
        is_favorited=bool(fav_set and project.id in fav_set),
        is_member=is_member,
        is_fit=is_fit,
        my_application_status=my_application_status,
    )


async def _reload_project(db: AsyncSession, project_id: int) -> Project:
    res = await db.execute(
        select(Project).options(*_PROJECT_OPTIONS).where(Project.id == project_id)
    )
    return res.scalar_one()


_NOTIFY = {
    "en": {
        "text": "🔔 <b>New Application!</b>\n\n<b>{a}</b> applied to join your project <b>{p}</b>.\n\nTap the button below to review their request.",
        "btn": "👀 Review Application",
    },
    "uz": {
        "text": "🔔 <b>Yangi ariza!</b>\n\n<b>{a}</b> sizning <b>{p}</b> loyihangizga qo‘shilish uchun ariza yubordi.\n\nKo‘rib chiqish uchun quyidagi tugmani bosing.",
        "btn": "👀 Arizani ko‘rish",
    },
    "ru": {
        "text": "🔔 <b>Новая заявка!</b>\n\n<b>{a}</b> хочет присоединиться к вашему проекту <b>{p}</b>.\n\nНажмите кнопку ниже, чтобы рассмотреть заявку.",
        "btn": "👀 Рассмотреть заявку",
    },
}


_DECISION = {
    "en": {
        "accepted": "🎉 <b>You're in!</b>\nYour application to <b>{p}</b> was accepted.",
        "declined": "Your application to <b>{p}</b> was not accepted this time. Keep exploring other projects!",
        "btn": "🚀 Open BFU",
    },
    "uz": {
        "accepted": "🎉 <b>Tabriklaymiz!</b>\n<b>{p}</b> loyihasiga arizangiz qabul qilindi.",
        "declined": "Afsuski, <b>{p}</b> loyihasiga arizangiz bu safar qabul qilinmadi. Boshqa loyihalarni ko‘rib chiqing!",
        "btn": "🚀 BFU’ni ochish",
    },
    "ru": {
        "accepted": "🎉 <b>Поздравляем!</b>\nВаша заявка в <b>{p}</b> принята.",
        "declined": "К сожалению, ваша заявка в <b>{p}</b> в этот раз не принята. Посмотрите другие проекты!",
        "btn": "🚀 Открыть BFU",
    },
}


async def _notify_founder(
    founder_telegram_id: int,
    applicant_name: str,
    project_name: str,
    project_type: str,
    application_id: int,
    lang: str = "en",
) -> None:
    """Send a Telegram notification to the founder about a new application."""
    if not settings.BOT_TOKEN:
        return
    # Deep link: req_{type}_{app_id} — frontend routes to Requests tab & highlights this app
    start_param = f"req_{project_type}_{application_id}"
    webapp_url = f"{settings.WEBAPP_URL}?startapp={start_param}"

    import html
    tr = _NOTIFY.get(lang, _NOTIFY["en"])
    text = tr["text"].format(
        a=html.escape(applicant_name or ""),
        p=html.escape(project_name or ""),
    )
    payload = {
        "chat_id": founder_telegram_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {
            "inline_keyboard": [[
                {
                    "text": tr["btn"],
                    "web_app": {"url": webapp_url},
                }
            ]]
        },
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json=payload,
            )
    except Exception:
        pass  # Non-critical — don't fail the request


# ── Project CRUD ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    type: str | None = None,
    is_hiring: bool | None = None,
    region_id: int | None = None,
    near: bool | None = None,
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Project)
        .options(*_PROJECT_LIST_OPTIONS)
        .where(
            Project.is_deleted == False,
            Project.is_approved == True,
            Project.is_draft == False,
        )
    )
    if type:
        q = q.where(Project.type == type)
    if is_hiring is not None:
        q = q.where(Project.is_hiring == is_hiring)
    q = q.order_by(Project.is_pinned.desc(), Project.created_at.desc()).limit(limit).offset(offset)
    projects = (await db.execute(q)).scalars().all()

    rid = region_id or (current_user.region_id if near else None)
    if rid:
        projects = [
            p for p in projects
            if any(r.region_id == rid for r in p.req_regions) or not p.req_regions
        ]

    pids = [p.id for p in projects]
    member_count_by, my_status_by = await _bulk_list_extras(db, pids, current_user.id)
    fav_set = await _load_fav_set(db, current_user.id)
    return [
        _project_list_response(p, current_user,
                               member_count_by.get(p.id, 0),
                               my_status_by.get(p.id),
                               fav_set)
        for p in projects
    ]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.type not in ("startup", "volunteering"):
        raise HTTPException(status_code=400, detail="type must be 'startup' or 'volunteering'")

    project = Project(
        type=body.type,
        creator_id=current_user.id,
        name=body.name,
        goal=body.goal,
        channel=body.channel,
        about=body.about,
        age_from=body.age_from,
        age_to=body.age_to,
        gender_req=body.gender_req,
        is_active=body.is_active,
        is_hiring=body.is_hiring,
        is_draft=body.is_draft,
    )
    db.add(project)
    await db.flush()

    # Auto-add creator as member
    db.add(ProjectMember(project_id=project.id, user_id=current_user.id))

    await _set_requirements(db, project, body.req_region_ids, body.req_skills, body.req_knowledges)
    await db.commit()

    if settings.ADMIN_GROUP_ID and not project.is_draft:
        await send_telegram(
            settings.ADMIN_GROUP_ID,
            f"🆕 <b>New {body.type}</b>: {esc(project.name)}\nby {esc(current_user.display_name)}"
            f" — awaiting approval (Admin → Projects).",
        )

    loaded = await _reload_project(db, project.id)
    return _project_response(loaded, current_user)


@router.get("/mine", response_model=list[ProjectResponse])
async def my_projects(
    type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Project)
        .options(*_PROJECT_LIST_OPTIONS)
        .where(Project.creator_id == current_user.id, Project.is_deleted == False)
    )
    if type:
        q = q.where(Project.type == type)
    projects = (await db.execute(q)).scalars().all()
    pids = [p.id for p in projects]
    member_count_by, my_status_by = await _bulk_list_extras(db, pids, current_user.id)
    fav_set = await _load_fav_set(db, current_user.id)
    return [
        _project_list_response(p, current_user,
                               member_count_by.get(p.id, 0),
                               my_status_by.get(p.id),
                               fav_set)
        for p in projects
    ]


@router.get("/my-requests", response_model=list[ApplicationOut])
async def my_requests(
    type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns all applications for projects created by current_user (founder's inbox)."""
    # Get founder's projects
    proj_q = select(Project).where(
        Project.creator_id == current_user.id,
        Project.is_deleted == False,
    )
    if type:
        proj_q = proj_q.where(Project.type == type)
    proj_res = await db.execute(proj_q)
    my_project_ids = [p.id for p in proj_res.scalars().all()]

    if not my_project_ids:
        return []

    # Load applications with applicant eagerly
    app_q = (
        select(ProjectApplication)
        .options(selectinload(ProjectApplication.applicant))
        .where(
            ProjectApplication.project_id.in_(my_project_ids),
            ProjectApplication.status == "pending",
        )
        .order_by(ProjectApplication.created_at.desc())
    )
    app_res = await db.execute(app_q)
    apps = app_res.scalars().all()

    # Build response — we need project name & type
    proj_map_res = await db.execute(
        select(Project).where(Project.id.in_(my_project_ids))
    )
    proj_map = {p.id: p for p in proj_map_res.scalars().all()}

    return [
        ApplicationOut(
            id=a.id,
            project_id=a.project_id,
            project_name=proj_map[a.project_id].name,
            project_type=proj_map[a.project_id].type,
            status=a.status,
            created_at=a.created_at,
            applicant=ApplicantPublic.model_validate(a.applicant),
        )
        for a in apps
    ]


@router.get("/favorites", response_model=list[ProjectResponse])
async def my_favorites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Projects this user has bookmarked."""
    rows = (await db.execute(
        select(Project)
        .join(Favorite, Favorite.project_id == Project.id)
        .options(*_PROJECT_OPTIONS)
        .where(Favorite.user_id == current_user.id, Project.is_deleted == False)
        .order_by(Favorite.created_at.desc())
    )).scalars().all()
    fav_set = {p.id for p in rows}
    return [_project_response(p, current_user, fav_set) for p in rows]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .options(*_PROJECT_OPTIONS)
        .where(Project.id == project_id, Project.is_deleted == False)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Bump view count for everyone except the creator — one atomic UPDATE
    # instead of mutating the loaded ORM object + full-session commit.
    if project.creator_id != current_user.id:
        try:
            await db.execute(
                update(Project).where(Project.id == project.id)
                .values(view_count=Project.view_count + 1)
            )
            await db.commit()
        except Exception:
            await db.rollback()
    fav_row = await db.execute(
        select(Favorite).where(Favorite.user_id == current_user.id,
                               Favorite.project_id == project.id)
    )
    fav_set = {project.id} if fav_row.scalar_one_or_none() else set()
    return _project_response(project, current_user, fav_set)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .options(*_PROJECT_OPTIONS)
        .where(Project.id == project_id, Project.is_deleted == False)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your project")

    data = body.model_dump(exclude_none=True)
    req_region_ids = data.pop("req_region_ids", None)
    req_skills = data.pop("req_skills", None)
    req_knowledges = data.pop("req_knowledges", None)

    for field, value in data.items():
        setattr(project, field, value)

    if req_region_ids is not None or req_skills is not None or req_knowledges is not None:
        await _set_requirements(
            db, project,
            req_region_ids or [],
            req_skills or [],
            req_knowledges or [],
        )

    await db.commit()
    loaded = await _reload_project(db, project.id)
    return _project_response(loaded, current_user)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your project")
    project.is_deleted = True
    await db.commit()


# ── Application endpoints ──────────────────────────────────────────────────────

@router.post("/{project_id}/apply", status_code=status.HTTP_201_CREATED)
async def apply_to_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a pending application. Does NOT instantly join."""
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.members), selectinload(Project.applications))
        .where(Project.id == project_id, Project.is_deleted == False, Project.is_hiring == True)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or not hiring")

    if project.creator_id == current_user.id:
        raise HTTPException(status_code=400, detail="You are the creator")

    if any(m.user_id == current_user.id for m in project.members):
        raise HTTPException(status_code=409, detail="Already a member")

    if any(a.applicant_id == current_user.id for a in project.applications):
        raise HTTPException(status_code=409, detail="Application already submitted")

    app = ProjectApplication(project_id=project_id, applicant_id=current_user.id, status="pending")
    db.add(app)
    try:
        await db.commit()
    except IntegrityError:
        # Concurrent double-tap raced past the in-Python check; the unique
        # constraint caught it. Treat as the same "already applied" outcome.
        await db.rollback()
        raise HTTPException(status_code=409, detail="Application already submitted")
    await db.refresh(app)

    # Notify founder via Telegram bot
    founder_res = await db.execute(select(User).where(User.id == project.creator_id))
    founder = founder_res.scalar_one_or_none()
    if founder and founder.telegram_id:
        await _notify_founder(
            founder_telegram_id=founder.telegram_id,
            applicant_name=current_user.display_name,
            project_name=project.name,
            project_type=project.type,
            application_id=app.id,
            lang=getattr(founder, "language", "en") or "en",
        )

    return {"id": app.id, "status": "pending"}


@router.patch("/{project_id}/applications/{app_id}")
async def review_application(
    project_id: int,
    app_id: int,
    body: _ReviewBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Founder accepts or declines an application."""
    # Verify ownership
    proj_res = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )
    project = proj_res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your project")

    app_res = await db.execute(
        select(ProjectApplication).where(
            ProjectApplication.id == app_id,
            ProjectApplication.project_id == project_id,
        )
    )
    app = app_res.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if body.action not in ("accept", "decline"):
        raise HTTPException(status_code=400, detail="action must be 'accept' or 'decline'")

    # Only a pending application can be decided. Without this, declining an
    # already-accepted application flips its status to 'declined' but leaves
    # the ProjectMember row in place (and re-sends a contradictory DM).
    if app.status != "pending":
        raise HTTPException(status_code=409, detail="Application already reviewed")

    if body.action == "accept":
        app.status = "accepted"
        # Check not already a member
        existing = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == app.applicant_id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(ProjectMember(project_id=project_id, user_id=app.applicant_id))
    else:
        app.status = "declined"

    app.decided_at = dt.datetime.utcnow()
    await db.commit()

    # Notify the applicant of the decision
    applicant_res = await db.execute(select(User).where(User.id == app.applicant_id))
    applicant = applicant_res.scalar_one_or_none()
    if applicant and applicant.telegram_id:
        lang = (applicant.language or "en") if (applicant.language or "en") in _DECISION else "en"
        msg = _DECISION[lang]["accepted" if app.status == "accepted" else "declined"]
        await send_telegram(
            applicant.telegram_id,
            msg.format(p=esc(project.name)),
            reply_markup={"inline_keyboard": [[{
                "text": _DECISION[lang]["btn"],
                "web_app": {"url": f"{settings.WEBAPP_URL}?startapp=project_{project_id}"},
            }]]},
        )

    return {"status": app.status}


@router.delete("/{project_id}/apply", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_application(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Withdraw a pending application."""
    # .all() (not scalar_one_or_none) so legacy duplicate rows don't raise
    # MultipleResultsFound and 500 the withdraw forever.
    result = await db.execute(
        select(ProjectApplication).where(
            ProjectApplication.project_id == project_id,
            ProjectApplication.applicant_id == current_user.id,
        )
    )
    apps = result.scalars().all()
    if not apps:
        raise HTTPException(status_code=404, detail="No application found")
    if any(a.status != "pending" for a in apps):
        # Once accepted the user is a member — they must use "leave" instead.
        raise HTTPException(
            status_code=409,
            detail="Cannot withdraw an application that was already reviewed",
        )
    for a in apps:
        await db.delete(a)
    await db.commit()


@router.delete("/{project_id}/join", status_code=status.HTTP_204_NO_CONTENT)
async def leave_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Not a member")

    proj = await db.execute(select(Project).where(Project.id == project_id))
    project = proj.scalar_one_or_none()
    if project and project.creator_id == current_user.id:
        raise HTTPException(status_code=400, detail="Creator cannot leave; delete the project instead")

    await db.delete(member)
    await db.commit()


@router.post("/{project_id}/favorite", status_code=status.HTTP_201_CREATED)
async def add_favorite(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = await db.get(Project, project_id)
    if not p or p.is_deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    existing = await db.execute(
        select(Favorite).where(Favorite.user_id == current_user.id,
                               Favorite.project_id == project_id)
    )
    if not existing.scalar_one_or_none():
        db.add(Favorite(user_id=current_user.id, project_id=project_id))
        await db.commit()
    return {"ok": True}


@router.delete("/{project_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.project_id == project_id,
        )
    )
    await db.commit()


@router.get("/{project_id}/stats", response_model=dict)
async def project_stats(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Founder dashboard: applicant counts, views, average decision time."""
    proj = await db.get(Project, project_id)
    if not proj or proj.is_deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    if proj.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your project")
    apps = (await db.execute(
        select(ProjectApplication).where(ProjectApplication.project_id == project_id)
    )).scalars().all()
    pending = sum(1 for a in apps if a.status == "pending")
    accepted = sum(1 for a in apps if a.status == "accepted")
    declined = sum(1 for a in apps if a.status == "declined")
    decided = [(a.decided_at - a.created_at) for a in apps
               if a.decided_at and a.created_at]
    if decided:
        avg_h = sum(d.total_seconds() for d in decided) / 3600 / len(decided)
        avg_decision_hours = round(avg_h, 1)
    else:
        avg_decision_hours = None
    return {
        "pending": pending,
        "accepted": accepted,
        "declined": declined,
        "views": proj.view_count or 0,
        "avg_decision_hours": avg_decision_hours,
    }
