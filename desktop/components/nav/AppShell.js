"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import Atmosphere from "@/components/Atmosphere";
import { ADMIN_ROLES } from "@/components/nav/navConfig";

// AppShell — the ONE premium left-sidebar shell for the whole logged-in app.
// Replaces the old wrapping-pill top bar (AppNav / AppTopBar). It owns the page
// chrome so pages only supply their content:
//
//   <AppShell active="mentors" me={me}>{pageContent}</AppShell>
//
//   • a fixed, full-height left sidebar (~248px): brand → grouped vertical nav
//     (EXPLORE / YOU / ADMIN) → pinned notifications row + profile block.
//   • a scrollable main region to its right with the firelit <Atmosphere/> and a
//     comfortable, wide content container.
//
// `active` highlights the current nav key. `me` is the server-fetched user; when
// absent AppShell self-fetches GET /users/me on mount (so authed pages that
// don't already have `me` still work). Below ~1024px the sidebar collapses
// off-canvas behind a slim top bar + hamburger, sliding in over a scrim (the
// slide is disabled under prefers-reduced-motion).

const SIDEBAR_W = 248;

// ── Nav inventory, grouped. Simple monochrome marks (amber only when active),
// consistent with the existing Chorsu accent glyphs. ──
const GROUPS = [
  {
    label: "Explore",
    items: [
      { key: "city", href: "/city", label: "City", icon: "✦" },
      { key: "projects", href: "/projects", label: "Projects", icon: "◆" },
      { key: "people", href: "/connections", label: "People", icon: "❋" },
      { key: "mentors", href: "/mentors", label: "Mentors", icon: "◈" },
      { key: "events", href: "/events", label: "Events", icon: "✧" },
      { key: "partners", href: "/partners", label: "Partners", icon: "⬡" },
    ],
  },
  {
    label: "You",
    items: [
      { key: "home", href: "/home", label: "Home", icon: "⌂" },
      { key: "projects-mine", href: "/projects/mine", label: "Your projects", icon: "◆" },
      { key: "requests", href: "/requests", label: "Applications", icon: "✒" },
      { key: "favorites", href: "/favorites", label: "Saved", icon: "❥" },
      { key: "connections", href: "/connections", label: "Connections", icon: "❋" },
      { key: "sessions", href: "/bookings", label: "Sessions", icon: "◷" },
      { key: "settings", href: "/settings", label: "Settings", icon: "✎" },
    ],
  },
];

const ADMIN_GROUP = {
  label: "Admin",
  items: [{ key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "▦" }],
};

const POLL_MS = 30000;

// A single sidebar nav row. Active → warm amber wash + left accent bar + amber
// text; hover → gentle surface-2 lift.
function NavRow({ item, active, onNavigate }) {
  const on = active === item.key;
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className="ash-row"
      data-on={on ? "1" : undefined}
    >
      <span className="ash-row-accent" aria-hidden />
      <span className="ash-row-icon" aria-hidden>
        {item.icon}
      </span>
      <span className="ash-row-label">{item.label}</span>
    </a>
  );
}

function GroupLabel({ children }) {
  return <div className="ash-grouplabel">{children}</div>;
}

export default function AppShell({ active, me: initialMe = null, children }) {
  const [me, setMe] = useState(initialMe);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef(null);

  // Self-fetch `me` only when the server didn't hand it to us.
  useEffect(() => {
    if (initialMe) return;
    let alive = true;
    bfu("/users/me")
      .then((r) => alive && setMe(r || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initialMe]);

  // Poll the notifications unread count (mount + every 30s; paused while hidden).
  const loadCount = useCallback(async () => {
    try {
      const r = await bfu("/users/me/notifications/unread-count");
      setUnread(Number(r?.unread) || 0);
    } catch {
      // Silent — a transient failure shouldn't disrupt the shell.
    }
  }, []);
  useEffect(() => {
    loadCount();
    let timer = null;
    const start = () => {
      stop();
      timer = window.setInterval(loadCount, POLL_MS);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        loadCount();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadCount]);

  // Close the profile menu on outside-click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const isAdmin = !!me && ADMIN_ROLES.has(me.role);
  const name = me?.display_name || me?.name || "You";
  const groups = isAdmin ? [...GROUPS, ADMIN_GROUP] : GROUPS;
  const badge = unread > 99 ? "99+" : String(unread);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

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

  // The sidebar body — shared by the fixed desktop rail and the mobile drawer.
  const Sidebar = () => (
    <div className="ash-sidebar-inner">
      {/* Brand */}
      <a href="/home" className="ash-brand" onClick={closeDrawer}>
        <img
          src="/bfu-mark.png"
          alt="BFU"
          style={{ height: 30, width: "auto", display: "block", filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }}
        />
        <span className="ash-wordmark">Bright Futures</span>
      </a>

      <div className="ash-brand-hair" />

      {/* Grouped nav — scrolls if it ever overflows */}
      <nav className="ash-nav" aria-label="Primary">
        {groups.map((g) => (
          <div key={g.label} className="ash-group">
            <GroupLabel>{g.label}</GroupLabel>
            {g.items.map((item) => (
              <NavRow key={item.key} item={item} active={active} onNavigate={closeDrawer} />
            ))}
          </div>
        ))}
      </nav>

      {/* Pinned bottom: notifications + profile */}
      <div className="ash-foot">
        <a href="/notifications" className="ash-row ash-notif" onClick={closeDrawer} data-on={active === "notifications" ? "1" : undefined}>
          <span className="ash-row-accent" aria-hidden />
          <span className="ash-row-icon" aria-hidden>
            ◔
          </span>
          <span className="ash-row-label">Notifications</span>
          {unread > 0 && (
            <span className="ash-badge" aria-label={`${unread} unread`}>
              <span className="ch-online-ping" style={{ background: "var(--ember)", opacity: 0.5 }} />
              <span style={{ position: "relative" }}>{badge}</span>
            </span>
          )}
        </a>

        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="ash-profile"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Your account"
          >
            <Avatar size={34} />
            <span className="ash-profile-meta">
              <span className="ash-profile-name">{name}</span>
              {isAdmin && <span className="ash-profile-role">Admin</span>}
            </span>
            <span className="ash-profile-caret" aria-hidden>
              {menuOpen ? "▾" : "▸"}
            </span>
          </button>
          {menuOpen && (
            <div role="menu" className="ash-menu">
              {me?.id && (
                <a href={`/u/${me.id}`} role="menuitem" className="ash-menu-item" onClick={() => setMenuOpen(false)}>
                  <span className="ash-menu-icon" aria-hidden>
                    ✦
                  </span>
                  View public profile
                </a>
              )}
              <a href="/settings" role="menuitem" className="ash-menu-item" onClick={() => setMenuOpen(false)}>
                <span className="ash-menu-icon" aria-hidden>
                  ✎
                </span>
                Edit profile
              </a>
              <div className="ash-menu-hair" />
              <a href="/api/auth/logout" role="menuitem" className="ash-menu-item ash-menu-muted">
                <span className="ash-menu-icon" aria-hidden>
                  ↩
                </span>
                Log out
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="ash-root">
      {/* Fixed desktop sidebar (≥1024px) */}
      <aside className="ash-sidebar" aria-label="Sidebar navigation">
        <Sidebar />
      </aside>

      {/* Mobile off-canvas drawer + scrim (<1024px) */}
      <div className={`ash-scrim${drawerOpen ? " ash-scrim-on" : ""}`} onClick={closeDrawer} aria-hidden={!drawerOpen} />
      <aside className={`ash-drawer${drawerOpen ? " ash-drawer-on" : ""}`} aria-hidden={!drawerOpen} aria-label="Sidebar navigation">
        <Sidebar />
      </aside>

      {/* Main region */}
      <div className="ash-main">
        <Atmosphere />

        {/* Slim mobile top bar with the hamburger (only visible <1024px) */}
        <div className="ash-topbar">
          <button
            type="button"
            className="ash-hamburger"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
          <a href="/home" className="ash-topbar-brand">
            <img
              src="/bfu-mark.png"
              alt="BFU"
              style={{ height: 26, width: "auto", display: "block", filter: "drop-shadow(0 2px 8px rgba(232,161,92,0.25))" }}
            />
          </a>
          <a href="/notifications" className="ash-topbar-bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
            🔔
            {unread > 0 && <span className="ash-topbar-dot" aria-hidden />}
          </a>
        </div>

        <div className="ash-content">{children}</div>
      </div>

      <style>{`
        .ash-root { min-height: 100vh; }

        /* ── Desktop sidebar ── */
        .ash-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: ${SIDEBAR_W}px;
          z-index: 50;
          background: rgba(20,18,15,0.72);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-right: 1px solid var(--hair);
        }
        .ash-sidebar-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 20px 14px 16px;
        }
        .ash-brand {
          display: flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
          padding: 4px 8px 0;
        }
        .ash-wordmark {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .ash-brand-hair {
          height: 1px;
          background: linear-gradient(90deg, var(--hair), transparent);
          margin: 16px 6px 12px;
        }
        .ash-nav {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-right: 2px;
        }
        .ash-nav::-webkit-scrollbar { width: 5px; }
        .ash-nav::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 9px; }
        .ash-group { display: flex; flex-direction: column; gap: 2px; }
        .ash-grouplabel {
          font-family: var(--font-mono);
          font-size: 9.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
          opacity: 0.7;
          padding: 4px 12px 6px;
        }

        /* ── Nav row ── */
        .ash-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 11px;
          height: 40px;
          padding: 0 12px;
          border-radius: 11px;
          text-decoration: none;
          color: var(--muted);
          font-size: 14px;
          font-family: var(--font-body);
          transition: background 0.16s ease, color 0.16s ease;
        }
        .ash-row:hover { background: var(--surface-2); color: var(--text); }
        .ash-row-accent {
          position: absolute;
          left: 0;
          top: 9px;
          bottom: 9px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: transparent;
        }
        .ash-row-icon {
          width: 18px;
          text-align: center;
          font-size: 13px;
          color: var(--muted);
          flex: 0 0 auto;
          transition: color 0.16s ease;
        }
        .ash-row:hover .ash-row-icon { color: var(--amber); }
        .ash-row-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ash-row[data-on="1"] {
          background: rgba(232,161,92,0.12);
          color: var(--amber);
          box-shadow: 0 0 22px rgba(255,106,61,0.10) inset;
        }
        .ash-row[data-on="1"] .ash-row-icon { color: var(--amber); }
        .ash-row[data-on="1"] .ash-row-accent {
          background: linear-gradient(180deg, var(--amber), var(--terra));
          box-shadow: 0 0 10px rgba(232,161,92,0.7);
        }
        .ash-row:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

        /* ── Foot: notifications + profile ── */
        .ash-foot {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--hair);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ash-notif .ash-badge {
          margin-left: auto;
          position: relative;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 99px;
          background: linear-gradient(135deg, var(--ember), var(--terra));
          color: #160E08;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 10px rgba(255,106,61,0.5);
        }
        .ash-profile {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid var(--hair);
          background: rgba(35,32,25,0.5);
          cursor: pointer;
          text-align: left;
          transition: border-color 0.16s ease, background 0.16s ease;
        }
        .ash-profile:hover { border-color: var(--amber); background: rgba(35,32,25,0.85); }
        .ash-profile:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
        .ash-profile-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .ash-profile-name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 13.5px;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ash-profile-role {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--amber);
        }
        .ash-profile-caret { color: var(--muted); font-size: 11px; flex: 0 0 auto; }

        .ash-menu {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          right: 0;
          background: var(--surface);
          border: 1px solid var(--hair);
          border-radius: 14px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.55);
          z-index: 90;
          padding: 8px;
        }
        .ash-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          text-decoration: none;
          color: var(--text);
          font-size: 14px;
        }
        .ash-menu-item:hover { background: var(--surface-2); }
        .ash-menu-icon { width: 18px; text-align: center; color: var(--amber); font-size: 13px; }
        .ash-menu-muted .ash-menu-icon { color: var(--muted); }
        .ash-menu-hair { height: 1px; background: var(--hair); margin: 6px 4px; }

        /* ── Main region ── */
        .ash-main {
          position: relative;
          min-height: 100vh;
          margin-left: ${SIDEBAR_W}px;
        }
        .ash-content {
          position: relative;
          z-index: 2;
          max-width: 1280px;
          margin: 0 auto;
          padding: 30px 44px 100px;
        }

        /* ── Mobile top bar (hidden ≥1024px) ── */
        .ash-topbar { display: none; }
        .ash-scrim { display: none; }
        .ash-drawer { display: none; }

        @media (max-width: 1023px) {
          .ash-sidebar { display: none; }
          .ash-main { margin-left: 0; }
          .ash-content { padding: 18px 22px 90px; }

          .ash-topbar {
            position: sticky;
            top: 0;
            z-index: 40;
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 18px;
            background: rgba(11,10,8,0.82);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--hair);
          }
          .ash-hamburger {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 11px;
            border: 1px solid var(--hair);
            background: rgba(35,32,25,0.6);
            color: var(--text);
            font-size: 18px;
            cursor: pointer;
          }
          .ash-hamburger:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
          .ash-topbar-brand { display: flex; align-items: center; margin-right: auto; }
          .ash-topbar-bell {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 11px;
            border: 1px solid var(--hair);
            background: rgba(35,32,25,0.6);
            font-size: 17px;
            text-decoration: none;
          }
          .ash-topbar-dot {
            position: absolute;
            top: 7px;
            right: 8px;
            width: 8px;
            height: 8px;
            border-radius: 99px;
            background: var(--ember);
            box-shadow: 0 0 8px rgba(255,106,61,0.8);
          }

          .ash-scrim {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 60;
            background: rgba(0,0,0,0.55);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.24s ease;
          }
          .ash-scrim-on { opacity: 1; pointer-events: auto; }

          .ash-drawer {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: ${SIDEBAR_W}px;
            max-width: 84vw;
            z-index: 70;
            background: rgba(20,18,15,0.96);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-right: 1px solid var(--hair);
            transform: translateX(-100%);
            transition: transform 0.26s cubic-bezier(0.2,0.9,0.3,1);
          }
          .ash-drawer-on { transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .ash-scrim, .ash-drawer { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
