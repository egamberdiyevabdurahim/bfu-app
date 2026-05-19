from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_admin_user, get_super_admin_user
from app.database import get_db
import json
from app.models.user import User, PendingLocation, Report, ErrorLog
from app.services.notify import send_telegram
from app.models.project import Project
from app.models.region import Region, School, LearningCenter
from app.models.event import Event
from datetime import datetime
from app.schemas.user import AdminUserOut
from app.schemas.project import AdminProjectOut
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["admin"])

class StatsOut(BaseModel):
    users: int
    projects: int
    regions: int
    schools: int
    learning_centers: int

class UpdateGroupConfig(BaseModel):
    group_id: int | None = None
    group_link: str | None = None
    name: str | None = None
    region_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None

class CreateLocation(BaseModel):
    name: str
    region_id: int
    group_id: int | None = None
    group_link: str | None = None
    latitude: float | None = None
    longitude: float | None = None

class UpdateRoleConfig(BaseModel):
    role: str


DENIABLE_FIELDS = {"name", "surname", "phone_number", "about", "birth_year", "gender", "tg_username"}


class DenyBody(BaseModel):
    fields: list[str]
    note: str | None = None


_DENY_NOTIFY = {
    "en": "⚠️ Your BFU profile needs corrections in: <b>{fields}</b>.\n\n{note}\n\nTap below to fix it.",
    "uz": "⚠️ Profilingizda quyidagi maydonlarni to‘g‘rilash kerak: <b>{fields}</b>.\n\n{note}\n\nTuzatish uchun tugmani bosing.",
    "ru": "⚠️ В вашем профиле нужно исправить: <b>{fields}</b>.\n\n{note}\n\nНажмите, чтобы исправить.",
}
_VERIFY_NOTIFY = {
    "en": "✅ Your BFU profile has been verified. Welcome!",
    "uz": "✅ Profilingiz tasdiqlandi. Xush kelibsiz!",
    "ru": "✅ Ваш профиль подтверждён. Добро пожаловать!",
}

# ── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsOut)
async def get_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    users = await db.scalar(select(func.count(User.id)))
    projects = await db.scalar(select(func.count(Project.id)))
    regions = await db.scalar(select(func.count(Region.id)))
    schools = await db.scalar(select(func.count(School.id)))
    lcs = await db.scalar(select(func.count(LearningCenter.id)))
    
    return StatsOut(
        users=users or 0,
        projects=projects or 0,
        regions=regions or 0,
        schools=schools or 0,
        learning_centers=lcs or 0,
    )

# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    skip: int = 0, limit: int = 50,
    search: str | None = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(User).order_by(User.id.desc())
    if search:
        search_term = f"%{search}%"
        q = q.where(User.name.ilike(search_term) | User.surname.ilike(search_term) | User.tg_username.ilike(search_term))
    
    q = q.offset(skip).limit(limit)
    res = await db.execute(q)
    return res.scalars().all()

@router.patch("/users/{user_id}/toggle-check")
async def toggle_user_check(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.checked = not user.checked
    await db.commit()
    return {"checked": user.checked}

@router.post("/users/{user_id}/deny")
async def deny_user_fields(
    user_id: int,
    body: DenyBody,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    bad = [f for f in body.fields if f not in DENIABLE_FIELDS]
    if bad:
        raise HTTPException(400, f"Cannot deny: {bad}")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.denied_fields = json.dumps(sorted(set(body.fields)))
    user.denied_note = (body.note or "")[:500] or None
    user.checked = False
    await db.commit()
    if user.telegram_id:
        lang = (user.language or "en") if (user.language or "en") in _DENY_NOTIFY else "en"
        await send_telegram(
            user.telegram_id,
            _DENY_NOTIFY[lang].format(fields=", ".join(body.fields), note=user.denied_note or ""),
            reply_markup={"inline_keyboard": [[{
                "text": "✏️ Open BFU", "web_app": {"url": settings.WEBAPP_URL},
            }]]},
        )
    return {"detail": "denied", "fields": body.fields}


@router.post("/users/{user_id}/verify")
async def verify_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.checked = True
    user.denied_fields = None
    user.denied_note = None
    await db.commit()
    if user.telegram_id:
        lang = (user.language or "en") if (user.language or "en") in _VERIFY_NOTIFY else "en"
        await send_telegram(user.telegram_id, _VERIFY_NOTIFY[lang])
    return {"detail": "verified"}


@router.get("/errors")
async def list_errors(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(ErrorLog).order_by(ErrorLog.id.desc()).limit(50))
    return [
        {"id": e.id, "path": e.path, "method": e.method, "message": e.message,
         "created_at": e.created_at}
        for e in res.scalars().all()
    ]


@router.patch("/projects/{project_id}/pin")
async def pin_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.is_pinned = not p.is_pinned
    await db.commit()
    return {"is_pinned": p.is_pinned}


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    body: UpdateRoleConfig,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if body.role not in ("user", "admin", "super_admin"):
        raise HTTPException(400, "Invalid role")
    user.role = body.role
    await db.commit()
    return {"role": user.role}

@router.delete("/users/{user_id}")
async def soft_delete_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.is_deleted = True
    await db.commit()
    return {"detail": "User soft deleted"}

@router.delete("/users/{user_id}/hard")
async def hard_delete_user(
    user_id: int,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    await db.delete(user)
    await db.commit()
    return {"detail": "User hard deleted"}

class EventBody(BaseModel):
    type: str
    title: str
    description: str | None = None
    link: str | None = None
    cover_url: str | None = None
    deadline: datetime | None = None
    region_id: int | None = None


class EventOut(BaseModel):
    id: int
    type: str
    title: str
    description: str | None = None
    link: str | None = None
    cover_url: str | None = None
    deadline: datetime | None = None
    region_id: int | None = None
    is_deleted: bool
    model_config = {"from_attributes": True}


@router.get("/events", response_model=list[EventOut])
async def admin_list_events(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Event).order_by(Event.id.desc()).limit(200))
    return res.scalars().all()


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def admin_create_event(body: EventBody, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    if not body.title.strip():
        raise HTTPException(400, "Title required")
    e = Event(
        type=body.type, title=body.title.strip(), description=body.description,
        link=body.link, cover_url=body.cover_url, deadline=body.deadline,
        region_id=body.region_id, created_by=admin.id,
    )
    db.add(e); await db.commit(); await db.refresh(e)
    return e


@router.patch("/events/{event_id}", response_model=EventOut)
async def admin_update_event(event_id: int, body: EventBody,
                              admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    e = await db.get(Event, event_id)
    if not e: raise HTTPException(404, "Event not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    await db.commit(); await db.refresh(e)
    return e


@router.delete("/events/{event_id}")
async def admin_delete_event(event_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    e = await db.get(Event, event_id)
    if not e: raise HTTPException(404, "Event not found")
    e.is_deleted = True
    await db.commit()
    return {"detail": "Event deleted"}


class ReportOut(BaseModel):
    id: int
    reporter_id: int
    target_type: str
    target_id: int
    reason: str | None = None
    resolved: bool
    model_config = {"from_attributes": True}


@router.get("/reports", response_model=list[ReportOut])
async def list_reports(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Report).order_by(Report.id.desc()).limit(100))
    return res.scalars().all()


@router.patch("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    r.resolved = not r.resolved
    await db.commit()
    return {"resolved": r.resolved}


# ── Projects ─────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=list[AdminProjectOut])
async def list_projects(
    skip: int = 0, limit: int = 50,
    search: str | None = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(Project).order_by(Project.id.desc())
    if search:
        q = q.where(Project.name.ilike(f"%{search}%"))
    
    q = q.offset(skip).limit(limit)
    res = await db.execute(q)
    return res.scalars().all()

@router.patch("/projects/{project_id}/approve")
async def approve_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.is_approved = not p.is_approved
    await db.commit()
    return {"is_approved": p.is_approved}

@router.delete("/projects/{project_id}")
async def soft_delete_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.is_deleted = True
    await db.commit()
    return {"detail": "Project soft deleted"}

@router.delete("/projects/{project_id}/hard")
async def hard_delete_project(
    project_id: int,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    await db.delete(p)
    await db.commit()
    return {"detail": "Project hard deleted"}

# ── Locations ────────────────────────────────────────────────────────────────

class RegionOut(BaseModel):
    id: int
    name_en: str
    name_uz: str
    name_ru: str
    model_config = {"from_attributes": True}

class PlaceOut(BaseModel):
    id: int
    name: str
    region_id: int
    group_id: int | None = None
    group_link: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    model_config = {"from_attributes": True}


@router.get("/my-bot-location", response_model=dict)
async def my_bot_location(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """The most recent location this admin shared with the Telegram bot."""
    loc = await db.get(PendingLocation, admin.telegram_id)
    if not loc:
        return {"latitude": None, "longitude": None}
    return {"latitude": loc.latitude, "longitude": loc.longitude}


@router.get("/regions", response_model=list[RegionOut])
async def list_regions(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Region).where(Region.is_deleted == False).order_by(Region.id))
    return res.scalars().all()

@router.get("/schools", response_model=list[PlaceOut])
async def list_schools(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(School).where(School.is_deleted == False).order_by(School.id))
    return res.scalars().all()

@router.post("/schools", status_code=status.HTTP_201_CREATED)
async def create_school(
    body: CreateLocation,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    if not await db.get(Region, body.region_id):
        raise HTTPException(400, "Region not found")
    s = School(
        name=name, region_id=body.region_id,
        group_id=body.group_id, group_link=body.group_link,
        latitude=body.latitude, longitude=body.longitude,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s

@router.patch("/schools/{school_id}")
async def update_school(
    school_id: int,
    body: UpdateGroupConfig,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    s = await db.get(School, school_id)
    if not s:
        raise HTTPException(404, "School not found")
    if body.group_id is not None:
        s.group_id = body.group_id
    if body.group_link is not None:
        s.group_link = body.group_link
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        s.name = name
    if body.region_id is not None:
        if not await db.get(Region, body.region_id):
            raise HTTPException(400, "Region not found")
        s.region_id = body.region_id
    if body.latitude is not None:
        s.latitude = body.latitude
    if body.longitude is not None:
        s.longitude = body.longitude
    await db.commit()
    return s

@router.delete("/schools/{school_id}")
async def delete_school(
    school_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    s = await db.get(School, school_id)
    if not s:
        raise HTTPException(404, "School not found")
    s.is_deleted = True
    await db.commit()
    return {"detail": "School deleted"}

@router.get("/learning-centers", response_model=list[PlaceOut])
async def list_lcs(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LearningCenter).where(LearningCenter.is_deleted == False).order_by(LearningCenter.id))
    return res.scalars().all()

@router.post("/learning-centers", status_code=status.HTTP_201_CREATED)
async def create_lc(
    body: CreateLocation,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    if not await db.get(Region, body.region_id):
        raise HTTPException(400, "Region not found")
    lc = LearningCenter(
        name=name, region_id=body.region_id,
        group_id=body.group_id, group_link=body.group_link,
        latitude=body.latitude, longitude=body.longitude,
    )
    db.add(lc)
    await db.commit()
    await db.refresh(lc)
    return lc

@router.patch("/learning-centers/{lc_id}")
async def update_lc(
    lc_id: int,
    body: UpdateGroupConfig,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    lc = await db.get(LearningCenter, lc_id)
    if not lc:
        raise HTTPException(404, "Learning Center not found")
    if body.group_id is not None:
        lc.group_id = body.group_id
    if body.group_link is not None:
        lc.group_link = body.group_link
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        lc.name = name
    if body.region_id is not None:
        if not await db.get(Region, body.region_id):
            raise HTTPException(400, "Region not found")
        lc.region_id = body.region_id
    if body.latitude is not None:
        lc.latitude = body.latitude
    if body.longitude is not None:
        lc.longitude = body.longitude
    await db.commit()
    return lc

@router.delete("/learning-centers/{lc_id}")
async def delete_lc(
    lc_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    lc = await db.get(LearningCenter, lc_id)
    if not lc:
        raise HTTPException(404, "Learning Center not found")
    lc.is_deleted = True
    await db.commit()
    return {"detail": "Learning Center deleted"}
