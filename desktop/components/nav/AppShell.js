"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import Atmosphere from "@/components/Atmosphere";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import CommandPalette from "@/components/search/CommandPalette";
import { EXPLORE, YOU, ADMIN, ADMIN_ROLES } from "@/components/nav/navConfig";
import { useT } from "@/components/i18n/LocaleProvider";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import NavIcon from "@/components/nav/NavIcon";

// AppShell — the ONE premium left-sidebar shell for the whole logged-in app
// (the "Hybrid" design). It owns the page chrome so pages only supply content:
//
//   <AppShell active="mentors" me={me}>{pageContent}</AppShell>
//
// Layout is a full-height flex column: a PINNED header (brand + collapse toggle,
// primary action, search) → a SCROLLABLE grouped nav (EXPLORE / YOU / ADMIN) →
// a PINNED profile footer (avatar menu + Marstiff credit). Only the middle nav
// scrolls; the header and footer stay put.
//
// Behaviours worth calling out:
//   • Nav scroll survives route changes. AppShell re-mounts per navigation, so
//     we persist the nav's scrollTop to sessionStorage and restore it on mount.
//   • Collapse to a 72px icon rail (persisted in sessionStorage); the main
//     content margin follows the sidebar width via the --ash-w custom property.
//   • Active row is derived from the CURRENT pathname (longest-matching href),
//     so exactly one row lights up regardless of a possibly-stale `active` prop
//     (kept only as an SSR-first-paint fallback).
//   • Below ~1024px the sidebar becomes an off-canvas drawer behind a hamburger,
//     with a focus trap + Escape + `inert`-while-closed. The collapse toggle is
//     desktop-only.

const SIDEBAR_W = 248;
const RAIL_W = 72;
const POLL_MS = 30000;
const NAV_SCROLL_KEY = "bfu:navScroll";
const COLLAPSE_KEY = "bfu:navCollapsed";

// Longest-matching-href wins → exactly one active key for a given pathname.
function deriveActiveKey(pathname, items) {
  if (!pathname) return null;
  let key = null;
  let len = -1;
  for (const it of items) {
    const href = it.href;
    if (!href) continue;
    const hit = pathname === href || pathname.startsWith(href + "/");
    if (hit && href.length > len) {
      key = it.key;
      len = href.length;
    }
  }
  return key;
}

// A single sidebar nav row. Active → warm amber wash + left accent bar + amber
// text; hover → gentle surface-2 lift. In the collapsed rail the label is hidden
// (CSS) and surfaced as a hover tooltip via `title`.
function NavRow({ item, label, on, isCollapsed, badge, onNavigate }) {
  return (
    <a
      // Render the /web-prefixed href (the app is basePath-hosted), but keep
      // navConfig hrefs BARE so deriveActiveKey still matches usePathname()
      // (which strips basePath).
      href={`/web${item.href}`}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className="ash-row"
      data-on={on ? "1" : undefined}
      title={isCollapsed ? label : undefined}
    >
      <span className="ash-row-accent" aria-hidden />
      <span className="ash-row-icon" aria-hidden>
        <NavIcon name={item.key} />
      </span>
      <span className="ash-row-label">{label}</span>
      {badge > 0 && (
        <span className="ash-row-badge" aria-label={`${badge} pending`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </a>
  );
}

export default function AppShell({ active, me: initialMe = null, children }) {
  const pathname = usePathname();
  const t = useT();

  const [me, setMe] = useState(initialMe);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);
  const [pendingApps, setPendingApps] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

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

  // Registration wall: a member who authenticated via Telegram but hasn't
  // finished web sign-up (is_registered === false) is bounced to /register.
  // The primary route is login → /register; this catches anyone who reaches an
  // app page directly before completing it.
  useEffect(() => {
    if (
      me &&
      me.is_registered === false &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/register")
    ) {
      window.location.href = "/web/register";
    }
  }, [me]);

  // Restore the collapsed rail preference for this session.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // sessionStorage may be unavailable (private mode / SSR) — ignore.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        sessionStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Poll the notifications unread count (mount + every 30s; paused while hidden).
  // Drives the mobile top-bar bell dot. Also polls the messages unread count in
  // the same tick (same cadence/visibility handling) to drive the Messages badge.
  const loadCount = useCallback(async () => {
    try {
      const r = await bfu("/users/me/notifications/unread-count");
      setUnread(Number(r?.unread) || 0);
    } catch {
      // Silent — a transient failure shouldn't disrupt the shell.
    }
    try {
      const m = await bfu("/conversations/unread-count");
      setMsgUnread(Number(m?.unread) || 0);
    } catch {
      // Silent.
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

  // Pending applications count → the "Applications" row badge. GET
  // /projects/my-requests returns the pending inbox, so its length is the count.
  useEffect(() => {
    let alive = true;
    bfu("/projects/my-requests")
      .then((r) => alive && setPendingApps(Array.isArray(r) ? r.length : 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Close the profile menu on outside-click / Escape. We match by CLASS rather
  // than a ref: the sidebar body is rendered twice (desktop rail + mobile
  // drawer), so a single shared ref would point at only one instance and the
  // outside-click test would misfire on the other — the bug that made the menu
  // links dead. `closest(".ash-profile-wrap")` correctly treats a click inside
  // EITHER profile block as "inside", so the menu stays open long enough for the
  // link's click to land.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      const t = e.target;
      const inside = t instanceof Element && t.closest(".ash-profile-wrap");
      if (!inside) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Mobile drawer: Escape to close + a focus trap while open. On open we move
  // focus into the drawer and keep Tab cycling inside it; on close we restore
  // focus to the element that opened it (the hamburger). Off-canvas links are
  // additionally taken out of the tab order via `inert` (see the aside below),
  // so keyboard users never land on hidden nav.
  const drawerRef = useRef(null);
  const hamburgerRef = useRef(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const opener = document.activeElement;
    const node = drawerRef.current;
    const focusables = () =>
      node
        ? Array.from(
            node.querySelectorAll(
              'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : [];
    const first = focusables()[0];
    if (first) first.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const restore = hamburgerRef.current || opener;
      if (restore && typeof restore.focus === "function") restore.focus();
    };
  }, [drawerOpen]);

  // Persist + restore the scrollable nav's position across route remounts. The
  // ref callback restores synchronously on mount (before paint → no jump); the
  // onScroll handler saves continuously. Attached to the DESKTOP rail only.
  const navScrollEl = useRef(null);
  const navRefCb = useCallback((node) => {
    navScrollEl.current = node;
    if (node) {
      try {
        const saved = sessionStorage.getItem(NAV_SCROLL_KEY);
        if (saved != null) node.scrollTop = parseInt(saved, 10) || 0;
      } catch {
        // ignore
      }
    }
  }, []);
  const onNavScroll = useCallback((e) => {
    try {
      sessionStorage.setItem(NAV_SCROLL_KEY, String(e.currentTarget.scrollTop));
    } catch {
      // ignore
    }
  }, []);

  const isAdmin = !!me && ADMIN_ROLES.has(me.role);
  const name = me?.display_name || me?.name || "You";
  // The current user's own presence dot. Driven by real `me.is_online`; while
  // the heartbeat pinger is running the backend keeps this true, so we only
  // hide the dot if the API EXPLICITLY reports offline (never fake it green
  // for other people — this is scoped to the viewer's own avatar).
  const selfOnline = me?.is_online !== false;
  const groups = [
    { id: "explore", label: t("nav.group.explore"), items: EXPLORE },
    { id: "you", label: t("nav.group.you"), items: YOU },
    ...(isAdmin ? [{ id: "admin", label: t("nav.group.admin"), items: ADMIN }] : []),
  ];
  // Pathname wins; the `active` prop is only a first-paint fallback.
  const activeKey =
    deriveActiveKey(pathname, [...EXPLORE, ...YOU, ...ADMIN]) || active || null;

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // The sidebar search control no longer navigates — it OPENS the ⌘K command
  // palette (mounted once below) via a window event the palette listens for.
  const openSearch = useCallback(() => {
    // Ignore the focus event the palette itself fires when it restores focus to
    // this field on close (otherwise closing would instantly reopen it).
    if (typeof window !== "undefined" && window.__bfuSuppressSearchFocus) return;
    setDrawerOpen(false);
    window.dispatchEvent(new CustomEvent("bfu:open-search"));
  }, []);
  const onSearchSubmit = useCallback(
    (e) => {
      e.preventDefault();
      openSearch();
    },
    [openSearch]
  );

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
  // Rendered via a plain function CALL (not <Sidebar/>) so it inlines into
  // AppShell's tree and never remounts on a state change (which would reset the
  // nav scroll). `isDrawer` disables the desktop-only collapse behaviour.
  const sidebarBody = ({ isDrawer }) => {
    const isCollapsed = !isDrawer && collapsed;
    return (
      <div className="ash-sidebar-inner">
        {/* ── Header (pinned) ── */}
        <div className="ash-head">
          <div className="ash-head-top">
            <a
              href="/web/home"
              className="ash-brand"
              onClick={closeDrawer}
              title={isCollapsed ? "Bright Futures" : undefined}
            >
              <img src="/bfu-mark.png" alt="BFU" className="ash-brand-mark" />
              <span className="ash-wordmark">Bright Futures</span>
            </a>
            {!isDrawer && (
              <button
                type="button"
                className="ash-collapse-btn"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                title={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? "›" : "‹"}
              </button>
            )}
          </div>

          {/* Primary action */}
          {isCollapsed ? (
            <a
              href="/web/projects/new"
              className="ash-cta ash-cta-icon"
              onClick={closeDrawer}
              title={t("common.start_project")}
              aria-label={t("common.start_project")}
            >
              <NavIcon name="plus" size={19} />
            </a>
          ) : (
            <a href="/web/projects/new" className="ash-cta" onClick={closeDrawer}>
              <NavIcon name="plus" size={17} />
              {t("common.start_project")}
            </a>
          )}

          {/* Search — opens the ⌘K command palette (never navigates). */}
          {isCollapsed ? (
            <button
              type="button"
              className="ash-icon-btn"
              onClick={openSearch}
              title={`${t("common.search")} (⌘K)`}
              aria-label={t("common.search")}
            >
              <NavIcon name="search" size={17} />
            </button>
          ) : (
            <form className="ash-search" role="search" onSubmit={onSearchSubmit}>
              <span className="ash-search-ic" aria-hidden>
                <NavIcon name="search" size={15} />
              </span>
              <input
                type="text"
                className="ash-search-in"
                placeholder={t("common.search_city")}
                aria-label={t("common.search_city")}
                readOnly
                onFocus={openSearch}
                onMouseDown={(e) => {
                  // Open on click without leaving the field focused/caret-blinking.
                  e.preventDefault();
                  openSearch();
                }}
              />
              <kbd className="ash-search-k" aria-hidden>
                ⌘K
              </kbd>
            </form>
          )}
        </div>

        {/* ── Nav (scrollable) ── */}
        {/* data-lenis-prevent: the app wraps everything in Lenis smooth-scroll
            (ReactLenis root), which hijacks wheel events and would scroll the
            window instead of THIS fixed sidebar's inner list. This attribute
            tells Lenis to leave the element alone so native overflow scroll
            works. */}
        <nav
          className="ash-nav"
          aria-label="Primary"
          data-lenis-prevent
          {...(!isDrawer ? { ref: navRefCb, onScroll: onNavScroll } : {})}
        >
          {groups.map((g) => (
            <div key={g.id} className="ash-group">
              <div className="ash-grouplabel">{g.label}</div>
              {g.items.map((item) => (
                <NavRow
                  key={item.key}
                  item={item}
                  label={t(`nav.${item.key}`)}
                  on={activeKey === item.key}
                  isCollapsed={isCollapsed}
                  badge={
                    item.badge === "applications"
                      ? pendingApps
                      : item.badge === "notifications"
                        ? unread
                        : item.badge === "messages"
                          ? msgUnread
                          : 0
                  }
                  onNavigate={closeDrawer}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* ── Profile footer (pinned, OUTSIDE the scroll container) ── */}
        <div className="ash-foot">
          <div className="ash-profile-wrap">
            <button
              type="button"
              className="ash-profile"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t("common.your_account")}
              title={isCollapsed ? name : undefined}
            >
              <span className="ash-avatar-wrap">
                <Avatar size={34} />
                {selfOnline && <span className="ash-online" aria-hidden />}
              </span>
              <span className="ash-profile-meta">
                <span className="ash-profile-name">{name}</span>
                <span className="ash-profile-role">{isAdmin ? t("common.admin") : t("common.builder")}</span>
              </span>
              <span className="ash-profile-caret" aria-hidden>
                {menuOpen ? "▾" : "▸"}
              </span>
            </button>

            {menuOpen && (
              <div role="menu" className="ash-menu">
                {me?.id && (
                  <a
                    href={`/web/u/${me.id}`}
                    role="menuitem"
                    className="ash-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="ash-menu-icon" aria-hidden>
                      ✦
                    </span>
                    {t("common.view_public_profile")}
                  </a>
                )}
                <a
                  href="/web/settings"
                  role="menuitem"
                  className="ash-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="ash-menu-icon" aria-hidden>
                    ✎
                  </span>
                  {t("common.edit_profile")}
                </a>
                <div className="ash-menu-hair" />
                <a href="/web/api/auth/logout" role="menuitem" className="ash-menu-item ash-menu-muted">
                  <span className="ash-menu-icon" aria-hidden>
                    ↩
                  </span>
                  {t("common.log_out")}
                </a>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div className="ash-lang">
              <LanguageSwitcher variant="rail" />
            </div>
          )}

          <a
            href="https://marstiff.uz"
            target="_blank"
            rel="noopener noreferrer"
            className="ash-credit"
            title={`${t("common.powered_by")} Marstiff`}
          >
            <span className="ash-credit-by">{t("common.powered_by")}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marstiff-mark.png" alt="" className="ash-credit-mark" />
            <span className="ash-credit-nm">Marstiff</span>
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="ash-root" style={{ "--ash-w": `${collapsed ? RAIL_W : SIDEBAR_W}px` }}>
      {/* Real-presence pinger (renders nothing) — keeps this user "online". */}
      <PresenceHeartbeat />
      {/* Global ⌘K / Ctrl-K command palette. Self-manages open state; also
          opens on the "bfu:open-search" event the search field dispatches. */}
      <CommandPalette />

      {/* Fixed desktop sidebar (≥1024px) */}
      <aside
        className={`ash-sidebar${collapsed ? " ash-collapsed" : ""}`}
        aria-label="Sidebar navigation"
      >
        {sidebarBody({ isDrawer: false })}
      </aside>

      {/* Mobile off-canvas drawer + scrim (<1024px). While closed the drawer is
          `inert` so its links stay out of the tab order and a11y tree; the scrim
          is inert too. The desktop sidebar above is NEVER inert. */}
      <div
        className={`ash-scrim${drawerOpen ? " ash-scrim-on" : ""}`}
        onClick={closeDrawer}
        aria-hidden="true"
        {...(!drawerOpen ? { inert: "" } : {})}
      />
      <aside
        ref={drawerRef}
        className={`ash-drawer${drawerOpen ? " ash-drawer-on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        {...(!drawerOpen ? { inert: "" } : {})}
      >
        {sidebarBody({ isDrawer: true })}
      </aside>

      {/* Main region */}
      <div className="ash-main">
        <Atmosphere />

        {/* Slim mobile top bar with the hamburger (only visible <1024px) */}
        <div className="ash-topbar">
          <button
            ref={hamburgerRef}
            type="button"
            className="ash-hamburger"
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
          <a href="/web/home" className="ash-topbar-brand">
            <img
              src="/bfu-mark.png"
              alt="BFU"
              style={{ height: 26, width: "auto", display: "block", filter: "drop-shadow(0 2px 8px rgba(232,161,92,0.25))" }}
            />
          </a>
          <a
            href="/web/notifications"
            className="ash-topbar-bell"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <NavIcon name="notifications" size={20} />
            {unread > 0 && <span className="ash-topbar-dot" aria-hidden />}
          </a>
        </div>

        <div className="ash-content">{children}</div>
      </div>

      <style>{`
        .ash-root { min-height: 100vh; }

        /* ── Desktop sidebar (full-height flex column) ── */
        .ash-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--ash-w, ${SIDEBAR_W}px);
          height: 100vh;
          height: 100dvh;
          z-index: 50;
          background: rgba(20,18,15,0.92);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-right: 1px solid var(--hair);
          transition: width 0.2s ease;
        }
        .ash-sidebar-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 18px 14px 14px;
        }

        /* ── Header (pinned, flex:0) ── */
        .ash-head { flex: 0 0 auto; display: flex; flex-direction: column; gap: 12px; }
        .ash-head-top { display: flex; align-items: center; gap: 10px; }
        .ash-brand {
          display: flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
          min-width: 0;
          flex: 1;
          padding: 2px 4px;
        }
        .ash-brand-mark {
          height: 24px;
          width: auto;
          display: block;
          flex: 0 0 auto;
          filter: drop-shadow(0 2px 10px rgba(232,161,92,0.25));
        }
        .ash-wordmark {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ash-collapse-btn {
          flex: 0 0 auto;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid var(--hair);
          background: rgba(35,32,25,0.5);
          color: var(--muted-strong);
          font-size: 15px;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
        }
        .ash-collapse-btn:hover { border-color: var(--amber); color: var(--amber); }
        .ash-collapse-btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

        /* Primary action */
        .ash-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--amber), var(--terra));
          color: #160E08;
          font-family: var(--font-body);
          font-weight: 700;
          font-size: 14px;
          text-decoration: none;
          box-shadow: 0 8px 22px rgba(232,161,92,0.24);
          transition: transform 0.18s cubic-bezier(0.2,1.3,0.4,1);
        }
        .ash-cta:hover { transform: translateY(-1px); }
        .ash-cta:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
        .ash-cta-icon { padding: 10px 0; font-size: 18px; }

        /* Search */
        .ash-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 11px;
          border-radius: 11px;
          border: 1px solid var(--hair);
          background: rgba(35,32,25,0.5);
          transition: border-color 0.16s ease, background 0.16s ease;
        }
        .ash-search:focus-within { border-color: var(--amber); background: rgba(35,32,25,0.8); }
        .ash-search-ic { color: var(--muted); font-size: 14px; flex: 0 0 auto; }
        .ash-search-in {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          outline: none;
          color: var(--text);
          font-family: var(--font-body);
          font-size: 13.5px;
        }
        .ash-search-in::placeholder { color: var(--muted); }
        .ash-search-k {
          flex: 0 0 auto;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--muted);
          border: 1px solid var(--hair);
          border-radius: 6px;
          padding: 2px 6px;
          background: rgba(11,10,8,0.4);
        }
        .ash-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 40px;
          border-radius: 11px;
          border: 1px solid var(--hair);
          background: rgba(35,32,25,0.5);
          color: var(--muted-strong);
          font-size: 16px;
          cursor: pointer;
          transition: border-color 0.16s ease, color 0.16s ease;
        }
        .ash-icon-btn:hover { border-color: var(--amber); color: var(--amber); }
        .ash-icon-btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

        /* ── Nav (scrollable, flex:1) ── */
        .ash-nav {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 14px;
          padding: 2px 2px 4px 0;
        }
        .ash-nav::-webkit-scrollbar { width: 5px; }
        .ash-nav::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 9px; }
        .ash-nav::-webkit-scrollbar-track { background: transparent; }
        .ash-group { display: flex; flex-direction: column; gap: 2px; }
        .ash-grouplabel {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted-strong);
          padding: 6px 12px 4px;
        }

        /* ── Nav row ── */
        .ash-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 11px;
          min-height: 38px;
          padding: 9px 12px;
          border-radius: 11px;
          text-decoration: none;
          color: var(--muted-strong);
          font-size: 14px;
          font-family: var(--font-body);
          transition: background 0.16s ease, color 0.16s ease;
        }
        .ash-row:hover { background: var(--surface-2); color: var(--text); }
        .ash-row-accent {
          position: absolute;
          left: 0;
          top: 8px;
          bottom: 8px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: transparent;
        }
        .ash-row-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          flex: 0 0 auto;
          transition: color 0.16s ease;
        }
        .ash-row-icon svg, .ash-search-ic svg { display: block; }
        .ash-row:hover .ash-row-icon { color: var(--amber); }
        .ash-row-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ash-row-badge {
          flex: 0 0 auto;
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
          box-shadow: 0 2px 10px rgba(255,106,61,0.45);
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

        /* ── Foot: profile + Marstiff credit (pinned, flex:0) ── */
        .ash-foot {
          flex: 0 0 auto;
          margin-top: 10px;
          padding-top: 12px;
          border-top: 1px solid var(--hair);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ash-profile-wrap { position: relative; }
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
        .ash-avatar-wrap { position: relative; flex: 0 0 auto; display: block; }
        .ash-online {
          position: absolute;
          right: -1px;
          bottom: -1px;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: var(--green);
          border: 2px solid var(--surface);
          box-shadow: 0 0 6px rgba(127,176,105,0.7);
        }
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
        .ash-menu-item:focus-visible { outline: 2px solid var(--amber); outline-offset: -2px; }
        .ash-menu-icon { width: 18px; text-align: center; color: var(--amber); font-size: 13px; }
        .ash-menu-muted .ash-menu-icon { color: var(--muted); }
        .ash-menu-hair { height: 1px; background: var(--hair); margin: 6px 4px; }

        /* Marstiff credit */
        .ash-credit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 2px 4px;
          text-decoration: none;
          opacity: 0.8;
          transition: opacity 0.16s ease;
        }
        .ash-credit:hover { opacity: 1; }
        .ash-credit:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; border-radius: 8px; }
        .ash-credit-by {
          font-family: var(--font-mono);
          font-size: 9.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .ash-credit-mark { height: 16px; width: auto; display: block; flex: 0 0 auto; }
        .ash-credit-nm {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 13px;
          color: var(--muted-strong);
        }

        /* ── Collapsed icon rail (desktop only; scoped to .ash-sidebar so the
             mobile drawer is never affected) ── */
        .ash-sidebar.ash-collapsed .ash-sidebar-inner { padding: 18px 10px 14px; }
        .ash-sidebar.ash-collapsed .ash-head-top { flex-direction: column; gap: 10px; }
        .ash-sidebar.ash-collapsed .ash-brand { justify-content: center; flex: 0 0 auto; padding: 2px 0; }
        .ash-sidebar.ash-collapsed .ash-wordmark { display: none; }
        .ash-sidebar.ash-collapsed .ash-row { justify-content: center; padding: 9px 0; gap: 0; }
        .ash-sidebar.ash-collapsed .ash-row-label { display: none; }
        .ash-sidebar.ash-collapsed .ash-row-icon { width: auto; font-size: 15px; }
        .ash-sidebar.ash-collapsed .ash-row-accent { top: 6px; bottom: 6px; }
        .ash-sidebar.ash-collapsed .ash-row-badge {
          position: absolute;
          top: 5px;
          right: 9px;
          min-width: 8px;
          width: 8px;
          height: 8px;
          padding: 0;
          font-size: 0;
          box-shadow: 0 0 6px rgba(255,106,61,0.7);
        }
        .ash-sidebar.ash-collapsed .ash-grouplabel {
          height: 1px;
          padding: 0;
          margin: 8px 12px;
          overflow: hidden;
          color: transparent;
          background: var(--hair);
        }
        .ash-sidebar.ash-collapsed .ash-profile { justify-content: center; padding: 8px 0; }
        .ash-sidebar.ash-collapsed .ash-profile-meta,
        .ash-sidebar.ash-collapsed .ash-profile-caret { display: none; }
        .ash-sidebar.ash-collapsed .ash-credit-by,
        .ash-sidebar.ash-collapsed .ash-credit-nm { display: none; }

        /* ── Main region ── */
        .ash-main {
          position: relative;
          min-height: 100vh;
          margin-left: var(--ash-w, ${SIDEBAR_W}px);
          transition: margin-left 0.2s ease;
        }
        .ash-content {
          position: relative;
          z-index: 2;
          max-width: 1280px;
          margin: 0 auto;
          padding: 30px 44px 100px;
        }

        /* ── Mobile top bar / scrim / drawer (hidden ≥1024px) ── */
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

        @media (max-width: 480px) {
          .ash-content { padding: 16px 16px 84px; }
          .ash-topbar { padding: 10px 14px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ash-scrim, .ash-drawer, .ash-sidebar, .ash-main, .ash-cta { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
