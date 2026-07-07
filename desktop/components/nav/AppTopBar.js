"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import NotificationsBell from "@/components/nav/NotificationsBell";

// The ONE shared logged-in top bar for every authed surface (/home, /settings,
// projects/*, /mentors, /bookings, /events, /partners, /connections,
// /favorites, /requests, /dashboard, /notifications). Replaces the ad-hoc
// per-page bars (home inline bar, ProjectsTopBar, CommunityTopBar, settings /
// dashboard headers) so the whole product reads as one thing.
//
// Client component: it fetches `me` on mount for (a) admin detection → the
// Dashboard link, and (b) the profile-menu avatar. It hosts the
// NotificationsBell and a profile menu (Settings, View public profile, Log
// out). `active` highlights the current section. Responsive: the primary nav
// collapses into a "Menu" popover below ~1080px.

// The primary nav. `key` matches the `active` prop; the emoji is the amber
// accent glyph used across Batches 1–4.
const NAV = [
  { key: "city", href: "/city", label: "City", icon: "✦" },
  { key: "projects", href: "/projects/mine", label: "Projects", icon: "◆" },
  { key: "people", href: "/connections", label: "People", icon: "❋" },
  { key: "mentors", href: "/mentors", label: "Mentors", icon: "◈" },
  { key: "events", href: "/events", label: "Events", icon: "✧" },
  { key: "partners", href: "/partners", label: "Partners", icon: "⬡" },
  { key: "sessions", href: "/bookings", label: "Sessions", icon: "◷" },
];

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function Brand() {
  return (
    <a href="/home" style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", flex: "0 0 auto" }}>
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

export default function AppTopBar({ active }) {
  const [me, setMe] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    let alive = true;
    bfu("/users/me")
      .then((r) => {
        if (alive) setMe(r || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const isAdmin = !!me && ADMIN_ROLES.has(me.role);
  const nav = isAdmin
    ? [...NAV, { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "▦" }]
    : NAV;

  // Close popovers on outside-click / Escape.
  const closeOnOutside = useCallback((ref, close) => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close();
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
  }, []);

  useEffect(() => (menuOpen ? closeOnOutside(menuRef, () => setMenuOpen(false)) : undefined), [menuOpen, closeOnOutside]);
  useEffect(() => (navOpen ? closeOnOutside(navRef, () => setNavOpen(false)) : undefined), [navOpen, closeOnOutside]);

  const name = me?.display_name || me?.name || "You";

  const Avatar = ({ size }) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: gradientFor(me?.id ?? 0),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.4,
        color: "#160E08",
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    >
      {me?.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials(name)
      )}
    </div>
  );

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

      {/* Desktop nav — hidden under ~1080px via .atb-nav-desktop CSS. */}
      <nav className="atb-nav-desktop" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 }}>
        {nav.map((item) => (
          <NavLink key={item.key} item={item} active={active} />
        ))}
      </nav>

      {/* Right cluster: compact-nav toggle (narrow only), bell, profile menu. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
        {/* Compact nav trigger — shown only under ~1080px via .atb-nav-compact. */}
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
                width: 220,
                background: "var(--surface)",
                border: "1px solid var(--hair)",
                borderRadius: 14,
                boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
                zIndex: 80,
                padding: 8,
              }}
            >
              {nav.map((item) => {
                const on = active === item.key;
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    onClick={() => setNavOpen(false)}
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
                    <span style={{ fontSize: 14, color: "var(--amber)", width: 16, textAlign: "center" }} aria-hidden>
                      {item.icon}
                    </span>
                    {item.label}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        <NotificationsBell />

        {/* Profile menu */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Your account"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 3,
              paddingRight: 8,
              borderRadius: 99,
              border: `1px solid ${menuOpen ? "var(--amber)" : "var(--hair)"}`,
              background: "rgba(35,32,25,0.6)",
              cursor: "pointer",
            }}
          >
            <Avatar size={30} />
            <span style={{ fontSize: 12, color: "var(--muted)" }} aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                width: 230,
                background: "var(--surface)",
                border: "1px solid var(--hair)",
                borderRadius: 14,
                boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
                zIndex: 80,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--hair)" }}>
                <Avatar size={36} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 14,
                      color: "var(--text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {name}
                  </div>
                  {isAdmin && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--amber)" }}>
                      Admin
                    </div>
                  )}
                </div>
              </div>
              {[
                { href: "/settings", label: "Settings", icon: "✎" },
                me?.id ? { href: `/u/${me.id}`, label: "View public profile", icon: "✦" } : null,
              ]
                .filter(Boolean)
                .map((it) => (
                  <a
                    key={it.href}
                    href={it.href}
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", textDecoration: "none", color: "var(--text)", fontSize: 14 }}
                  >
                    <span style={{ color: "var(--amber)", width: 16, textAlign: "center" }} aria-hidden>
                      {it.icon}
                    </span>
                    {it.label}
                  </a>
                ))}
              <a
                href="/api/auth/logout"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 14px",
                  textDecoration: "none",
                  color: "var(--text)",
                  fontSize: 14,
                  borderTop: "1px solid var(--hair)",
                }}
              >
                <span style={{ color: "var(--muted)", width: 16, textAlign: "center" }} aria-hidden>
                  ↩
                </span>
                Log out
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Responsive rules scoped to this bar. */}
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
