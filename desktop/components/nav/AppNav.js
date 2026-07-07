"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import NotificationsBell from "@/components/nav/NotificationsBell";
import { EXPLORE, YOU, ADMIN_ROLES, resolveYouHref } from "@/components/nav/navConfig";

// The ONE shared logged-in top bar for every surface — authed pages (via the
// thin AppTopBar wrapper) AND public pages (via SiteTopBar, which fetches `me`
// server-side and passes it in). It renders:
//   • the brand mark → /home
//   • the primary Explore bar (City, Projects, People, Mentors, Events,
//     Partners, + Dashboard for admins)
//   • the notifications bell
//   • a profile/account dropdown ("You") surfacing every personal destination
// so from ANY page a logged-in user reaches every feature in ≤2 clicks.
//
// `initialMe` is the server-fetched user (public pages). When absent, the
// component self-fetches GET /users/me on mount (authed pages), preserving the
// original AppTopBar behavior. `active` highlights the current section.
//
// Responsive: the primary bar collapses into a "Menu" popover (containing the
// full Explore + You inventory) below ~1080px.

function Brand() {
  return (
    <a
      href="/home"
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

export default function AppNav({ active, initialMe = null }) {
  const [me, setMe] = useState(initialMe);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef(null);
  const navRef = useRef(null);

  // Self-fetch `me` only when the server didn't hand it to us (authed pages).
  useEffect(() => {
    if (initialMe) return;
    let alive = true;
    bfu("/users/me")
      .then((r) => {
        if (alive) setMe(r || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initialMe]);

  const isAdmin = !!me && ADMIN_ROLES.has(me.role);

  // Primary bar = Explore (+ Dashboard for admins).
  const primary = isAdmin
    ? [...EXPLORE, { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "▦" }]
    : EXPLORE;

  // The "You" inventory, hrefs resolved against `me` (profile → /u/{id}).
  const youItems = YOU.map((it) => ({ ...it, href: resolveYouHref(it, me) })).filter(
    (it) => it.href
  );

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

  // A shared row renderer for the popover menus (compact nav + You dropdown).
  const MenuRow = ({ href, icon, label, on, onClick, iconColor = "var(--amber)" }) => (
    <a
      href={href}
      onClick={onClick}
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
      <span style={{ fontSize: 14, color: iconColor, width: 18, textAlign: "center" }} aria-hidden>
        {icon}
      </span>
      {label}
    </a>
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

      {/* Desktop primary nav — hidden under ~1080px via .atb-nav-desktop CSS. */}
      <nav
        className="atb-nav-desktop"
        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 }}
      >
        {primary.map((item) => (
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
                width: 240,
                maxHeight: "calc(100vh - 96px)",
                overflowY: "auto",
                background: "var(--surface)",
                border: "1px solid var(--hair)",
                borderRadius: 14,
                boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
                zIndex: 80,
                padding: 8,
              }}
            >
              <div style={{ ...sectionLabel }}>Explore</div>
              {primary.map((item) => (
                <MenuRow
                  key={item.key}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  on={active === item.key}
                  onClick={() => setNavOpen(false)}
                />
              ))}
              <div style={{ height: 1, background: "var(--hair)", margin: "8px 4px" }} />
              <div style={{ ...sectionLabel }}>You</div>
              {youItems.map((item) => (
                <MenuRow
                  key={item.key}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  on={active === item.key}
                  onClick={() => setNavOpen(false)}
                />
              ))}
              <div style={{ height: 1, background: "var(--hair)", margin: "8px 4px" }} />
              <MenuRow
                href="/api/auth/logout"
                icon="↩"
                label="Log out"
                iconColor="var(--muted)"
              />
            </div>
          )}
        </div>

        <NotificationsBell />

        {/* Profile / account menu — the "You" hub. */}
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
                width: 244,
                maxHeight: "calc(100vh - 96px)",
                overflowY: "auto",
                background: "var(--surface)",
                border: "1px solid var(--hair)",
                borderRadius: 14,
                boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
                zIndex: 80,
                overflowX: "hidden",
                padding: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 8px 12px",
                  borderBottom: "1px solid var(--hair)",
                  marginBottom: 6,
                }}
              >
                <Avatar size={38} />
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
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--amber)",
                      }}
                    >
                      Admin
                    </div>
                  )}
                </div>
              </div>

              {youItems.map((item) => (
                <MenuRow
                  key={item.key}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  on={active === item.key}
                  onClick={() => setMenuOpen(false)}
                />
              ))}

              {isAdmin && (
                <>
                  <div style={{ height: 1, background: "var(--hair)", margin: "8px 4px" }} />
                  <MenuRow
                    href="/dashboard"
                    icon="▦"
                    label="Dashboard"
                    on={active === "dashboard"}
                    onClick={() => setMenuOpen(false)}
                  />
                </>
              )}

              <div style={{ height: 1, background: "var(--hair)", margin: "8px 4px" }} />
              <MenuRow href="/api/auth/logout" icon="↩" label="Log out" iconColor="var(--muted)" />
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

// Small uppercase section header used inside the popover menus.
const sectionLabel = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--muted)",
  padding: "6px 12px 4px",
};
