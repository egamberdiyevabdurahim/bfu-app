"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Skills / knowledge / interests as tag chips — the desktop twin of the Mini
// App UserProfileModal's analysis-tag section.
//
// These are analysis ATTRIBUTES, not social-proof — so they render regardless
// of FLAGS.TRUST (unlike endorsements/vouches). Each non-empty group gets its
// own labelled row with a distinct accent; the whole cell is omitted when every
// group is empty. `knowledges`/`interests` are rendered only when the payload
// carries them — the /public/u/{id}/data contract currently sends `skills` only,
// so on today's data this shows a single Skills row.
const GROUPS = [
  { key: "skills", labelKey: "profile.skills", color: "var(--amber)", border: "rgba(232,161,92,0.34)" },
  { key: "knowledges", labelKey: "profile.knowledges", color: "var(--teal-bright)", border: "rgba(94,197,182,0.34)" },
  { key: "interests", labelKey: "profile.interests", color: "var(--green)", border: "rgba(127,176,105,0.34)" },
];

export default function SkillsCell({ skills, knowledges, interests }) {
  const t = useT();
  const source = { skills, knowledges, interests };
  const groups = GROUPS
    .map((g) => ({ ...g, tags: (source[g.key] || []).filter(Boolean) }))
    .filter((g) => g.tags.length > 0);
  if (groups.length === 0) return null;

  return (
    <div
      className="ch-cell-static"
      style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 20 }}
    >
      {groups.map((g) => (
        <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ch-cell-label">{t(g.labelKey)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {g.tags.map((tag, i) => (
              <span
                key={`${tag}-${i}`}
                className="ch-tag"
                style={{ color: g.color, borderColor: g.border }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
