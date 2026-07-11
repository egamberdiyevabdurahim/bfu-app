"use client";

import Link from "next/link";
import { gradientFor, initials } from "@/lib/avatar";
import { handleFor } from "@/lib/handle";
import { useT } from "@/components/i18n/LocaleProvider";

// Founder cell — a bento tile presenting the project's founder as a card that
// links to their /u/[id] profile. CLIENT component (uses useT for i18n). Uses
// the shared seeded gradient avatar (gradientFor(founder.id) + initials) exactly
// like the profile avatars, with a ✓ when the founder is checked/verified.
export default function FounderCell({ founder }) {
  const t = useT();
  if (!founder) return null;

  const displayName = founder.display_name || founder.name || t("profile.founder_fallback");

  return (
    <div className="ch-cell" style={{ gridColumn: "span 2", display: "flex", flexDirection: "column" }}>
      <div className="ch-cell-label">{t("profile.founder")}</div>

      <Link
        href={`/web/u/${handleFor(founder.id)}`}
        style={{
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          gap: 18,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            width: 66,
            height: 66,
            borderRadius: "50%",
            background: gradientFor(founder.id),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 24,
            color: "#160E08",
            overflow: "hidden",
            boxShadow: "0 0 0 1px rgba(255,106,61,0.28), 0 14px 34px rgba(255,106,61,0.18)",
          }}
        >
          {founder.photo_url ? (
            <img
              src={founder.photo_url}
              alt={displayName}
              style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            initials(displayName)
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              {displayName}
            </span>
            {founder.checked && (
              <span
                role="img"
                aria-label={t("profile.verified")}
                title={t("profile.verified")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(127,176,105,0.16)",
                  color: "var(--green)",
                  fontSize: 12,
                }}
              >
                ✓
              </span>
            )}
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted-strong)",
            }}
          >
            {t("profile.view_profile")} →
          </div>
        </div>
      </Link>
    </div>
  );
}
