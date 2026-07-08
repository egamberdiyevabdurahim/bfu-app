"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Shared page footer — the "brightfuturesuzbekistan.uz · <tagline>" strip that
// was copy-pasted inline across ~12 pages (and missing entirely on /requests &
// /settings). Pass a `tagline` (already translated by the caller) and optionally
// override the host label. flexWrap keeps the host + tagline from colliding on
// narrow widths.
export default function SiteFooter({
  tagline = "Someone is always building right now.",
  host = "brightfuturesuzbekistan.uz",
}) {
  const t = useT();
  return (
    <div style={{ marginTop: 60, paddingTop: 26, borderTop: "1px solid var(--hair)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: host ? "space-between" : "flex-end",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {host && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {host}
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 18,
            color: "var(--muted)",
          }}
        >
          {tagline}
        </span>
      </div>

      {/* Powered-by-Marstiff credit — shown on every page via the shared footer. */}
      <a
        href="https://marstiff.uz"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          textDecoration: "none",
          color: "var(--muted)",
          opacity: 0.85,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {t("misc.powered_by")}
        </span>
        <img
          src="/marstiff-mark.png"
          alt="Marstiff"
          width={16}
          height={16}
          style={{ display: "block", objectFit: "contain" }}
        />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: "0.01em",
            color: "var(--muted-strong)",
          }}
        >
          Marstiff
        </span>
      </a>
    </div>
  );
}
