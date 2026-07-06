import { gradientFor, initials } from "../lib/avatar";

// Screen 4 (/projects) project window — a SERVER component (no hooks; the
// hover-bloom + rise-in are pure CSS in globals.css `.ch-pcard`). The whole
// card is an <a href="/p/{id}">, mirroring BuilderCard's link-card grammar.
//
// Visual grammar: a type badge (Startup amber / Volunteering teal-green), a
// hiring pill (green, reusing the ch-online-ping halo) and/or a pinned marker,
// the project name (Bricolage), the goal as an Instrument-Serif italic line
// (CSS-truncated to 2 lines), up to 3 skill chips (mono pills), and a footer
// with the founder (seeded gradientFor(founder.id) avatar + name + ✓ verified)
// and "{team_count} building" + region name. Pinned projects render at higher
// visual weight (span-2, warmer wash, larger name — see `.ch-pcard-pinned`).
//
// ── FilterBar <-> ProjectBrowseCard data-* contract ──
// FilterBar (client) filters by walking [data-project] cards and reading these
// attributes. Every one MUST be present or client-side filtering silently
// no-ops:
//   data-type     "startup" | "volunteering" | ""
//   data-hiring   "1" | "0"

// Prefer the founder's chosen display name, then their real name.
function founderLabel(founder) {
  if (!founder) return "";
  return founder.display_name || founder.name || "";
}

// Region name: English first (the desktop app's default surface language),
// then Uzbek/Russian, matching how the profile/city surfaces resolve region.
function regionLabel(region) {
  if (!region) return "";
  return region.name_en || region.name_uz || region.name_ru || "";
}

export default function ProjectBrowseCard({ project = {}, index = 0 }) {
  const {
    id,
    type,
    name,
    goal,
    is_hiring: isHiring,
    pinned,
    founder,
    team_count: teamCount = 0,
    skills = [],
    region,
  } = project;

  const isStartup = type === "startup";
  const typeLabel = isStartup ? "Startup" : type === "volunteering" ? "Volunteering" : "Project";
  const badgeClass = isStartup
    ? "ch-pcard-badge ch-pcard-badge-startup"
    : "ch-pcard-badge ch-pcard-badge-volunteering";

  const topSkills = (skills || []).slice(0, 3);
  const fLabel = founderLabel(founder);
  const fGrad = gradientFor(founder?.id);
  const region_ = regionLabel(region);
  // "team_count building" counts the founder + joined teammates already on the
  // project. Guard against a missing/negative count.
  const buildingCount = Math.max(0, Number(teamCount) || 0);

  return (
    <a
      href={`/p/${id}`}
      className={`ch-pcard${pinned ? " ch-pcard-pinned" : ""}`}
      style={{ animationDelay: `${Math.min(index, 11) * 55}ms` }}
      // ── FilterBar <-> ProjectBrowseCard data-* contract ──
      data-project=""
      data-type={type || ""}
      data-hiring={isHiring ? "1" : "0"}
    >
      <div className="ch-pcard-top">
        <span className={badgeClass}>
          <i aria-hidden="true" />
          {typeLabel}
        </span>

        <span className="ch-pcard-marks">
          {pinned && (
            <span className="ch-pcard-pin" title="Featured project">
              ✦ Pinned
            </span>
          )}
          {isHiring && (
            <span className="ch-pcard-hiring">
              <span className="ch-pcard-ping" aria-hidden="true">
                <span className="ch-online-ping" style={{ background: "var(--green)" }} />
                <i />
              </span>
              Hiring
            </span>
          )}
        </span>
      </div>

      <h2 className="ch-pcard-nm">{name}</h2>

      {goal && <p className="ch-pcard-goal">{goal}</p>}

      {topSkills.length > 0 && (
        <div className="ch-pcard-tags">
          {topSkills.map((s, i) => (
            <span className="ch-pcard-t" key={`${s}-${i}`}>
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="ch-pcard-foot">
        {founder ? (
          <span className="ch-pcard-founder">
            <span className="ch-pcard-av" style={{ background: fGrad }}>
              {founder.photo_url ? (
                <img src={founder.photo_url} alt={fLabel} />
              ) : (
                initials(fLabel)
              )}
            </span>
            <span className="ch-pcard-fnm">
              {fLabel}
              {founder.checked && (
                <span className="ch-pcard-vf" title="Verified">
                  ✓
                </span>
              )}
            </span>
          </span>
        ) : (
          <span className="ch-pcard-founder" />
        )}

        <span className="ch-pcard-meta">
          <span className="ch-pcard-team">
            {buildingCount} building
          </span>
          {region_ && <div className="ch-pcard-reg">{region_}</div>}
        </span>
      </div>
    </a>
  );
}
