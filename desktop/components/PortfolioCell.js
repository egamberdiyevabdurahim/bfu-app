"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Portfolio links (label + url) rendered as external link pills — the desktop
// twin of the Mini App UserProfileModal's "Portfolio" section.
//
// These anchors point at the builder's own EXTERNAL urls, so they are plain
// <a href> to the raw url with no /web basePath (basePath only applies to this
// app's own internal routes). Omitted entirely when the payload carries no
// links, so the bento never shows an empty cell.
export default function PortfolioCell({ links }) {
  const t = useT();
  const items = (links || []).filter((l) => l && l.url);
  if (items.length === 0) return null;

  return (
    <div
      className="ch-cell-static"
      style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="ch-cell-label">{t("profile.portfolio")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((l, i) => (
          <a
            key={`${l.url}-${i}`}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ch-tag"
            style={{ color: "var(--amber)", borderColor: "rgba(232,161,92,0.34)", textDecoration: "none" }}
          >
            <span aria-hidden>🔗</span> {l.label || l.url}
          </a>
        ))}
      </div>
    </div>
  );
}
