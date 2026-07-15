"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { handleFor } from "@/lib/handle";
import { useT } from "@/components/i18n/LocaleProvider";
import { FLAGS } from "@/lib/flags";

// CommandPalette — the app-wide ⌘K / Ctrl-K search overlay.
//
// Mounted ONCE inside AppShell (logged-in chrome), next to <PresenceHeartbeat/>.
// It self-manages its open state and listens for TWO triggers so callers never
// need a ref or prop-drilling:
//   • a global ⌘K / Ctrl-K keydown (toggles it open from anywhere), and
//   • a `window` CustomEvent "bfu:open-search" (dispatched by the sidebar's
//     "Search the city ⌘K" field so clicking/focusing it opens the palette).
//
// Behaviour: autofocus on open, ~200ms-debounced GET /search, grouped
// People / Projects results, static "jump to" quick actions when the query is
// empty, ArrowUp/Down to move the amber highlight, Enter to open the highlighted
// row (SPA nav), Esc / click-outside to close, a Tab focus-trap, and focus
// restored to the opener on close.

const DEBOUNCE_MS = 200;

// Static quick-actions shown when the query is empty (command-palette feel).
// Every href is a real, existing route in this app. Labels are i18n keys,
// resolved to the current language where the rows are built.
//
// V1 launch scope: an action carrying a `flag` only appears while that flag is
// true in lib/flags.js — the palette must never jump to a surface that's hidden
// from the sidebar. Flip the flag and the row is back; nothing here is deleted.
const ALL_QUICK_ACTIONS = [
  { id: "new", href: "/projects/new", titleKey: "misc.qa_new_title", subtitleKey: "misc.qa_new_sub", icon: "＋" },
  { id: "city", href: "/city", titleKey: "misc.qa_city_title", subtitleKey: "misc.qa_city_sub", icon: "✦" },
  { id: "projects", href: "/projects", titleKey: "misc.qa_projects_title", subtitleKey: "misc.qa_projects_sub", icon: "◆" },
  { id: "mentors", href: "/mentors", titleKey: "misc.qa_mentors_title", subtitleKey: "misc.qa_mentors_sub", icon: "◈", flag: "MENTORING" },
  { id: "events", href: "/events", titleKey: "misc.qa_events_title", subtitleKey: "misc.qa_events_sub", icon: "✧" },
  { id: "mine", href: "/projects/mine", titleKey: "misc.qa_mine_title", subtitleKey: "misc.qa_mine_sub", icon: "❖" },
  { id: "connections", href: "/connections", titleKey: "misc.qa_connections_title", subtitleKey: "misc.qa_connections_sub", icon: "❋", flag: "CONNECTIONS" },
];

const QUICK_ACTIONS = ALL_QUICK_ACTIONS.filter((a) => !a.flag || FLAGS[a.flag] === true);

function ProjectIcon({ type }) {
  return (
    <span className="cmdk-picon" aria-hidden>
      {type === "volunteering" ? "❥" : "◆"}
    </span>
  );
}

function PersonAvatar({ person }) {
  const label = person.display_name || person.name || "Member";
  return (
    <span className="cmdk-avatar" style={{ background: gradientFor(person.id ?? 0) }}>
      {person.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.photo_url} alt="" />
      ) : (
        <span className="cmdk-avatar-txt">{initials(label)}</span>
      )}
      {person.is_online && <span className="cmdk-online" aria-hidden />}
    </span>
  );
}

export default function CommandPalette() {
  const router = useRouter();
  const t = useT();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null); // { people:[], projects:[] } | null
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const overlayRef = useRef(null);
  const restoreRef = useRef(null); // element to refocus on close
  const seq = useRef(0); // guards against out-of-order debounced responses

  const close = useCallback(() => setOpen(false), []);

  // ── Global triggers: ⌘K / Ctrl-K (toggle) + the sidebar's custom event. ──
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) restoreRef.current = document.activeElement;
          return next;
        });
      }
    };
    const onOpenEvent = () => {
      restoreRef.current = document.activeElement;
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("bfu:open-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("bfu:open-search", onOpenEvent);
    };
  }, []);

  // ── On open: focus the input. On close: reset + restore focus to the opener. ──
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    // closed → reset state and hand focus back to whatever opened us.
    setQ("");
    setResults(null);
    setActive(0);
    setLoading(false);
    const el = restoreRef.current;
    if (el && typeof el.focus === "function") {
      // The opener may be the sidebar search field, which opens the palette on
      // focus — restoring focus to it would immediately reopen us. Suppress that
      // one synchronous focus event (see AppShell's openSearch guard).
      window.__bfuSuppressSearchFocus = true;
      try {
        el.focus();
      } catch {
        /* element gone from the DOM — ignore */
      }
      window.__bfuSuppressSearchFocus = false;
    }
  }, [open]);

  // ── Debounced search. Empty/whitespace query → quick actions, no fetch. ──
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const my = ++seq.current;
    const id = setTimeout(async () => {
      try {
        const r = await bfu("/search", { params: { q: term, limit: 8 } });
        if (seq.current === my) setResults(r || { people: [], projects: [], events: [] });
      } catch {
        if (seq.current === my) setResults({ people: [], projects: [], events: [] });
      } finally {
        if (seq.current === my) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q, open]);

  const showActions = q.trim().length === 0;

  // Flat, ordered list of navigable rows (quick actions OR people+projects) —
  // one array so ArrowUp/Down + Enter share a single highlight index.
  const items = useMemo(() => {
    if (showActions) {
      return QUICK_ACTIONS.map((a) => ({
        kind: "action", key: `a-${a.id}`, href: a.href,
        title: t(a.titleKey), subtitle: t(a.subtitleKey), icon: a.icon,
      }));
    }
    const people = (results?.people || []).map((p) => ({
      kind: "person", key: `u-${p.id}`, href: `/u/${handleFor(p.id)}`,
      title: p.display_name || p.name || t("misc.member"),
      subtitle: p.region || null, person: p,
    }));
    const projects = (results?.projects || []).map((p) => ({
      kind: "project", key: `p-${p.id}`, href: `/p/${p.id}`,
      title: p.name, subtitle: p.goal || null, type: p.type, hiring: p.is_hiring,
    }));
    // Events — GET /search returns them too; each row deep-links to the events
    // page's highlight target (/events?e={id}, read by app/events/page.js).
    const events = (results?.events || []).map((e) => ({
      kind: "event", key: `e-${e.id}`, href: `/events?e=${e.id}`,
      title: e.title, subtitle: e.type || null,
    }));
    return [...people, ...projects, ...events];
  }, [showActions, results, t]);

  // Reset the highlight whenever the visible set changes.
  useEffect(() => {
    setActive(0);
  }, [q, results, open]);

  // Keep the highlighted row in view as arrows move it.
  useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const go = useCallback(
    (href) => {
      if (!href) return;
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  // Esc / Arrow / Enter handling (bubbles up from the input + rows).
  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (items.length ? (a + 1) % items.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[active];
        if (it) go(it.href);
      }
    },
    [items, active, go, close]
  );

  // Tab focus-trap — keep Tab cycling among the panel's focusable elements.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const node = panelRef.current;
      if (!node) return;
      const els = Array.from(
        node.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, items]);

  if (!open) return null;

  const peopleRows = items.filter((i) => i.kind === "person");
  const projectRows = items.filter((i) => i.kind === "project");
  const eventRows = items.filter((i) => i.kind === "event");
  const isEmpty = !showActions && !loading && items.length === 0;

  const renderRow = (it) => {
    const idx = items.indexOf(it);
    const on = idx === active;
    return (
      <a
        key={it.key}
        href={it.href}
        data-idx={idx}
        className="cmdk-row"
        data-on={on ? "1" : undefined}
        onMouseMove={() => setActive(idx)}
        onClick={(e) => {
          e.preventDefault();
          go(it.href);
        }}
      >
        {it.kind === "person" ? (
          <PersonAvatar person={it.person} />
        ) : it.kind === "project" ? (
          <ProjectIcon type={it.type} />
        ) : it.kind === "event" ? (
          <span className="cmdk-picon" aria-hidden>
            ✧
          </span>
        ) : (
          <span className="cmdk-aicon" aria-hidden>
            {it.icon}
          </span>
        )}
        <span className="cmdk-row-body">
          <span className="cmdk-row-title">
            {it.title}
            {it.kind === "project" && it.hiring && <span className="cmdk-tag">{t("misc.hiring")}</span>}
          </span>
          {it.subtitle && <span className="cmdk-row-sub">{it.subtitle}</span>}
        </span>
        <span className="cmdk-row-go" aria-hidden>
          ↵
        </span>
      </a>
    );
  };

  return (
    <div
      ref={overlayRef}
      className="cmdk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("misc.search_dialog")}
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={panelRef} className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-head">
          <span className="cmdk-head-ic" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="cmdk-input"
            placeholder={t("misc.search_placeholder")}
            aria-label={t("misc.search_aria")}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <span className="cmdk-spin" aria-hidden />}
          <kbd className="cmdk-esc">Esc</kbd>
        </div>

        <div className="cmdk-body">
          {showActions ? (
            <div className="cmdk-group">
              <div className="cmdk-grouplabel">{t("misc.jump_to")}</div>
              {items.map(renderRow)}
            </div>
          ) : (
            <>
              {loading && !results && <div className="cmdk-note">{t("misc.searching")}</div>}
              {peopleRows.length > 0 && (
                <div className="cmdk-group">
                  <div className="cmdk-grouplabel">{t("misc.group_people")}</div>
                  {peopleRows.map(renderRow)}
                </div>
              )}
              {projectRows.length > 0 && (
                <div className="cmdk-group">
                  <div className="cmdk-grouplabel">{t("misc.group_projects")}</div>
                  {projectRows.map(renderRow)}
                </div>
              )}
              {eventRows.length > 0 && (
                <div className="cmdk-group">
                  <div className="cmdk-grouplabel">{t("misc.group_events")}</div>
                  {eventRows.map(renderRow)}
                </div>
              )}
              {isEmpty && (
                <div className="cmdk-note">
                  {t("misc.no_results", { q: q.trim() })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("misc.foot_navigate")}
          </span>
          <span>
            <kbd>↵</kbd> {t("misc.foot_open")}
          </span>
          <span>
            <kbd>Esc</kbd> {t("misc.foot_close")}
          </span>
        </div>
      </div>

      <style>{`
        .cmdk-overlay {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 12vh 20px 20px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          background: rgba(6,5,4,0.68);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          animation: cmdk-fade 0.14s ease;
        }
        @keyframes cmdk-fade { from { opacity: 0; } to { opacity: 1; } }
        .cmdk-panel {
          width: 100%;
          max-width: 620px;
          max-height: 70vh;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border: 1px solid var(--hair);
          border-radius: 16px;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(232,161,92,0.06);
          overflow: hidden;
          animation: cmdk-rise 0.16s cubic-bezier(0.2,0.9,0.3,1);
        }
        @keyframes cmdk-rise { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }

        /* Header / input */
        .cmdk-head {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--hair);
        }
        .cmdk-head-ic { color: var(--amber); font-size: 17px; flex: 0 0 auto; }
        .cmdk-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          outline: none;
          color: var(--text);
          font-family: var(--font-body);
          font-size: 16px;
        }
        .cmdk-input::placeholder { color: var(--muted); }
        .cmdk-esc {
          flex: 0 0 auto;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--muted);
          border: 1px solid var(--hair);
          border-radius: 6px;
          padding: 2px 6px;
          background: rgba(11,10,8,0.4);
        }
        .cmdk-spin {
          flex: 0 0 auto;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid var(--hair);
          border-top-color: var(--amber);
          animation: cmdk-spin 0.7s linear infinite;
        }
        @keyframes cmdk-spin { to { transform: rotate(360deg); } }

        /* Body / groups */
        .cmdk-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 8px;
          scrollbar-width: thin;
        }
        .cmdk-body::-webkit-scrollbar { width: 6px; }
        .cmdk-body::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 9px; }
        .cmdk-group { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px; }
        .cmdk-grouplabel {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted-strong);
          padding: 8px 12px 4px;
        }
        .cmdk-note {
          padding: 26px 16px;
          text-align: center;
          color: var(--muted);
          font-size: 13.5px;
        }

        /* Row */
        .cmdk-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 12px;
          border-radius: 11px;
          text-decoration: none;
          color: var(--muted-strong);
          cursor: pointer;
        }
        .cmdk-row[data-on="1"] {
          background: rgba(232,161,92,0.13);
          color: var(--amber);
          box-shadow: 0 0 22px rgba(255,106,61,0.08) inset;
        }
        .cmdk-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .cmdk-row-title {
          font-family: var(--font-body);
          font-size: 14.5px;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cmdk-row[data-on="1"] .cmdk-row-title { color: var(--amber); }
        .cmdk-row-sub {
          font-size: 12px;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cmdk-row-go {
          flex: 0 0 auto;
          font-size: 13px;
          color: var(--amber);
          opacity: 0;
          transition: opacity 0.12s ease;
        }
        .cmdk-row[data-on="1"] .cmdk-row-go { opacity: 1; }
        .cmdk-tag {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--green);
          border: 1px solid rgba(127,176,105,0.4);
          border-radius: 99px;
          padding: 1px 7px;
          flex: 0 0 auto;
        }

        /* Row leading glyphs / avatars */
        .cmdk-aicon,
        .cmdk-picon {
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          color: var(--amber);
          background: var(--surface-2);
          border: 1px solid var(--hair);
        }
        .cmdk-avatar {
          position: relative;
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          overflow: hidden;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .cmdk-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .cmdk-avatar-txt {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 13px;
          color: #160E08;
        }
        .cmdk-online {
          position: absolute;
          right: -1px;
          bottom: -1px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--green);
          border: 2px solid var(--surface);
          box-shadow: 0 0 6px rgba(127,176,105,0.7);
        }

        /* Footer legend */
        .cmdk-foot {
          flex: 0 0 auto;
          display: flex;
          gap: 16px;
          padding: 9px 16px;
          border-top: 1px solid var(--hair);
          font-size: 11px;
          color: var(--muted);
        }
        .cmdk-foot kbd {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--muted-strong);
          border: 1px solid var(--hair);
          border-radius: 5px;
          padding: 1px 5px;
          margin-right: 3px;
          background: rgba(11,10,8,0.4);
        }

        @media (max-width: 560px) {
          .cmdk-overlay { padding: 8vh 12px 12px; }
          .cmdk-foot { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cmdk-overlay, .cmdk-panel { animation: none; }
          .cmdk-spin { animation-duration: 1.4s; }
        }
      `}</style>
    </div>
  );
}
