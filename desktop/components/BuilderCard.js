"use client";

import { gradientFor, initials } from "../lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";
import { handleFor } from "@/lib/handle";
import { FLAGS } from "@/lib/flags";

// Ports the mockup's `.card` (docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html
// lines 86-111, 236-250) into a SERVER component. No hooks — the online pulse is
// pure CSS (`.ch-online-ping`) and the hover-bloom is CSS `:hover`, so this can
// render on the server without breaking the client/server boundary.
//
// ⚠ FilterBar <-> BuilderCard CONTRACT: FilterBar (already built) filters
// client-side by walking `[data-builder]` cards and reading these exact DOM
// attributes. Every one of them MUST be present or filtering silently breaks.
// `slug()` below is byte-for-byte the same normalizer FilterBar uses on skill
// chips (see desktop/components/FilterBar.js slug()), so `data-skills` tokens
// match the chip keys.

// Normalize a skill token for stable data-attribute matching — MUST stay in
// lockstep with FilterBar.slug().
function slug(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// The green "looking for" badge label. The /public/city contract carries both
// `looking_for` ('work'|'volunteering'|'both'|null) and a `mentor` boolean. A
// mentor reads as the strongest signal, then co-founder (work/both), then
// volunteer — matching the profile's LookingForCell framing.
//
// V1: with FLAGS.MENTORING off the mentor badge is never chosen and the card
// falls through to its co-founder/volunteer label. Flip the flag back to `true`
// and the mentor badge wins again, exactly as before.
function lookingLabel(builder, t) {
  if (FLAGS.MENTORING && builder.mentor) return t("city.card.mentor");
  const lf = builder.looking_for;
  if (lf === "work" || lf === "both") return t("city.card.cofounder");
  if (lf === "volunteering") return t("city.card.volunteer");
  return null;
}

export default function BuilderCard({ builder = {}, index = 0, regionLabel = "" }) {
  const t = useT();
  const {
    id,
    name,
    display_name,
    checked,
    photo_url,
    online,
    currently_building,
    skills = [],
    looking_for,
    mentor,
    rating,
    weight,
    region_id,
  } = builder;

  const label = display_name || name || "";
  const grad = gradientFor(id);
  const isNew = weight === "new" || rating == null;
  const topSkills = (skills || []).slice(0, 3);
  const look = lookingLabel(builder, t);
  const big = weight === "high";

  // The comma-joined slug list FilterBar's skill chips test against.
  const skillSlugs = (skills || []).map(slug).filter(Boolean).join(",");

  return (
    <a
      href={`/web/u/${handleFor(id)}`}
      className={`ch-card${big ? " ch-card-big" : ""}`}
      style={{ animationDelay: `${Math.min(index, 11) * 55}ms` }}
      // ── FilterBar <-> BuilderCard data-* contract ──
      data-builder=""
      data-online={online ? "1" : "0"}
      data-region={region_id != null ? String(region_id) : ""}
      data-looking-for={looking_for || ""}
      data-mentor={mentor ? "1" : "0"}
      data-skills={skillSlugs}
    >
      <div className="ch-card-wash" style={{ background: grad }} />

      {look && (
        <div className="ch-card-look">
          <i aria-hidden="true" />
          {look}
        </div>
      )}

      <div className="ch-card-av" style={{ background: grad }}>
        {photo_url ? (
          <img src={photo_url} alt={label} />
        ) : (
          initials(label)
        )}
      </div>

      {online && (
        <span className="ch-card-pres" aria-hidden="true">
          <span className="ch-online-ping" />
          <i />
        </span>
      )}

      <div className="ch-card-body">
        <div className="ch-card-nm">
          {label}
          {checked && (
            <span className="ch-card-vf" title={t("city.card.verified")}>
              ✓
            </span>
          )}
        </div>

        {currently_building && (
          <div className="ch-card-bld">
            {t("city.card.is_building")} <b>{currently_building}</b>
          </div>
        )}

        {topSkills.length > 0 && (
          <div className="ch-card-tags">
            {topSkills.map((t, i) => (
              <span className="ch-card-t" key={`${t}-${i}`}>
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="ch-card-foot">
          <span className="ch-card-reg">{regionLabel}</span>
          <span className={`ch-card-rep${isNew ? " ch-card-rep-new" : ""}`}>
            {isNew ? `✶ ${t("city.card.new")}` : `★ ${rating}`}
          </span>
        </div>
      </div>
    </a>
  );
}
