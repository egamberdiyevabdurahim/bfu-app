"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// The logged-OUT site nav, rendered by SiteTopBar when getMe() returns null.
// Deliberately minimal, NOT the old wrapping-pill bar: brand left, two calm
// explore links (City, Projects), and a single prominent "Log in" button right.
// The full city can be wandered from the two public surfaces; everything else
// nudges the visitor to sign in via the Log in button.

const LINKS = [
  { key: "city", href: "/city", labelKey: "misc.nav_city", icon: "✦" },
  { key: "projects", href: "/projects", labelKey: "misc.nav_projects", icon: "◆" },
];

function Brand() {
  return (
    <a
      href="/city"
      style={{ display: "flex", alignItems: "center", gap: 13, textDecoration: "none", flex: "0 0 auto" }}
    >
      <img
        src="/bfu-mark.png"
        alt="BFU"
        style={{ height: 32, width: "auto", display: "block", filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }}
      />
      <span
        className="pn-wordmark"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Bright Futures
      </span>
    </a>
  );
}

export default function PublicNav({ active }) {
  const t = useT();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "6px 0 8px",
      }}
    >
      <Brand />

      {/* Two calm explore links — no wrapping, no pill clutter. */}
      <nav className="pn-links" style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
        {LINKS.map((item) => {
          const on = active === item.key;
          return (
            <a
              key={item.key}
              href={item.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 99,
                textDecoration: "none",
                fontSize: 14,
                color: on ? "var(--amber)" : "var(--muted)",
                background: on ? "rgba(232,161,92,0.10)" : "transparent",
                transition: "color 0.16s ease, background 0.16s ease",
              }}
            >
              <span style={{ fontSize: 13, color: on ? "var(--amber)" : "inherit" }} aria-hidden>
                {item.icon}
              </span>
              {t(item.labelKey)}
            </a>
          );
        })}
      </nav>

      <a href="/login" className="ch-btn-primary" style={{ marginLeft: "auto", flex: "0 0 auto" }}>
        {t("misc.log_in")} <span style={{ fontSize: 14 }}>↗</span>
      </a>

      <style>{`
        @media (max-width: 560px) {
          .pn-wordmark { display: none; }
          .pn-links { gap: 2px; }
        }
      `}</style>
    </div>
  );
}
