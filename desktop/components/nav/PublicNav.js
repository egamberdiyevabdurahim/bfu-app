"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXPLORE } from "@/components/nav/navConfig";

// The logged-OUT site nav, rendered by SiteTopBar when getMe() returns null.
// Brand mark + the public Explore links (City, Projects, People discover) + a
// clear "Log in" button → /login. Mirrors AppNav's brand + responsive-menu
// grammar so the two auth states feel like one bar.
//
// People/Mentors/Events/Partners are surfaced too (they route through /login
// when a visitor isn't authed), so a logged-out visitor can still see the full
// shape of the city and is nudged to sign in.

// The public-facing Explore set: the truly-public surfaces first, then the rest
// (which prompt a login when tapped).
const PUBLIC_PRIMARY = EXPLORE.filter((i) => i.public);
const PUBLIC_MORE = EXPLORE.filter((i) => !i.public);

function Brand() {
  return (
    <a
      href="/city"
      style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", flex: "0 0 auto" }}
    >
      <img
        src="/bfu-mark.png"
        alt="BFU"
        style={{ height: 36, width: "auto", display: "block", filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }}
      />
      <div style={{ width: 1, height: 24, background: "var(--hair)" }} className="atb-wordmark-hair" />
      <span
        className="atb-wordmark"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Bright Futures Uzbekistan
      </span>
    </a>
  );
}

function NavLink({ item, active }) {
  const on = active === item.key;
  return (
    <a
      href={item.href}
      className="ch-btn-ghost"
      style={on ? { borderColor: "var(--amber)", background: "rgba(35,32,25,0.9)" } : undefined}
    >
      <span style={{ fontSize: 14, color: "var(--amber)" }} aria-hidden>
        {item.icon}
      </span>
      {item.label}
    </a>
  );
}

export default function PublicNav({ active }) {
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef(null);

  const close = useCallback(() => setNavOpen(false), []);
  useEffect(() => {
    if (!navOpen) return;
    const onDown = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [navOpen, close]);

  const MenuRow = ({ item }) => {
    const on = active === item.key;
    return (
      <a
        href={item.href}
        onClick={close}
        role="menuitem"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 10,
          textDecoration: "none",
          color: on ? "var(--amber)" : "var(--text)",
          background: on ? "rgba(255,106,61,0.08)" : "transparent",
          fontSize: 14,
        }}
      >
        <span style={{ fontSize: 14, color: "var(--amber)", width: 18, textAlign: "center" }} aria-hidden>
          {item.icon}
        </span>
        {item.label}
      </a>
    );
  };

  return (
    <div
      className="atb-root"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "12px 0 8px",
      }}
    >
      <Brand />

      {/* Desktop Explore links — hidden under ~1080px. */}
      <nav
        className="atb-nav-desktop"
        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 }}
      >
        {PUBLIC_PRIMARY.map((item) => (
          <NavLink key={item.key} item={item} active={active} />
        ))}
      </nav>

      {/* Right cluster: compact-menu toggle (narrow only) + Log in. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
        <div className="atb-nav-compact" ref={navRef} style={{ position: "relative", display: "none" }}>
          <button
            type="button"
            className="ch-btn-ghost"
            aria-haspopup="true"
            aria-expanded={navOpen}
            aria-label="Menu"
            onClick={() => setNavOpen((v) => !v)}
            style={{ padding: "10px 14px", ...(navOpen ? { borderColor: "var(--amber)", background: "rgba(35,32,25,0.9)" } : {}) }}
          >
            <span style={{ fontSize: 15 }} aria-hidden>
              ☰
            </span>
            Menu
          </button>
          {navOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                width: 232,
                background: "var(--surface)",
                border: "1px solid var(--hair)",
                borderRadius: 14,
                boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
                zIndex: 80,
                padding: 8,
              }}
            >
              {[...PUBLIC_PRIMARY, ...PUBLIC_MORE].map((item) => (
                <MenuRow key={item.key} item={item} />
              ))}
              <div style={{ height: 1, background: "var(--hair)", margin: "8px 4px" }} />
              <a
                href="/login"
                onClick={close}
                className="ch-btn-primary"
                style={{ justifyContent: "center", width: "100%", marginTop: 2 }}
              >
                Log in ↗
              </a>
            </div>
          )}
        </div>

        <a href="/login" className="ch-btn-primary" style={{ flex: "0 0 auto" }}>
          Log in <span style={{ fontSize: 14 }}>↗</span>
        </a>
      </div>

      {/* Responsive rules scoped to this bar (mirror AppNav). */}
      <style>{`
        @media (max-width: 1080px) {
          .atb-nav-desktop { display: none !important; }
          .atb-nav-compact { display: block !important; }
        }
        @media (max-width: 620px) {
          .atb-wordmark, .atb-wordmark-hair { display: none !important; }
        }
      `}</style>
    </div>
  );
}
