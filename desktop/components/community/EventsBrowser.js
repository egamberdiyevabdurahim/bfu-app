"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";

// Events (Batch 4). Two feeds:
//   GET /events         → EventOut[] { id, type, title, description, link,
//                                      cover_url, deadline, region_id, created_at }
//   GET /events/for-me  → same fields + { matched:[tag], score } (relevance-ranked
//                         against the user's AI tags + region — the "For you" tab)
// Rendered as Chorsu event cards; each card links out to `link` when present.

const TYPE_STYLE = {
  hackathon: { color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  grant: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  scholarship: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  meetup: { color: "var(--teal-bright)", bg: "rgba(94,197,182,0.14)", bd: "rgba(94,197,182,0.34)" },
};
const DEFAULT_TYPE = { color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" };

function fmtDeadline(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function EventCard({ ev }) {
  const t = useT();
  const style = TYPE_STYLE[ev.type] || DEFAULT_TYPE;
  const deadline = fmtDeadline(ev.deadline);
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 11px",
            borderRadius: "var(--radius-pill)",
            background: style.bg,
            border: `1px solid ${style.bd}`,
            color: style.color,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {ev.type || t("community.events.typeFallback")}
        </span>
        {deadline ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", letterSpacing: "0.04em" }}>
            {t("community.events.by", { date: deadline })}
          </span>
        ) : null}
      </div>

      <h3
        style={{
          margin: "14px 0 0",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 20,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          color: "var(--text)",
        }}
      >
        {ev.title}
      </h3>

      {ev.description ? (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--muted)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {ev.description}
        </p>
      ) : null}

      {Array.isArray(ev.matched) && ev.matched.length ? (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ev.matched.map((m, i) => (
            <span
              key={`${m}-${i}`}
              className="ch-tag"
              style={{ color: "var(--green)", borderColor: "rgba(127,176,105,0.34)", background: "rgba(127,176,105,0.1)" }}
            >
              {m}
            </span>
          ))}
        </div>
      ) : null}

      {ev.link ? (
        <div
          style={{
            marginTop: 16,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          {t("community.openDetails")}
        </div>
      ) : null}
    </>
  );

  const cellStyle = { display: "block", padding: 28, color: "var(--text)", textDecoration: "none" };
  // Only the outbound-link variant is a real clickable tile → keep the .ch-cell
  // hover glow. A card with no link is passive → .ch-cell-static (no false lift).
  return ev.link ? (
    <a href={ev.link} target="_blank" rel="noopener noreferrer" className="ch-cell" style={cellStyle}>
      {inner}
    </a>
  ) : (
    <div className="ch-cell-static" style={cellStyle}>
      {inner}
    </div>
  );
}

export default function EventsBrowser() {
  const t = useT();
  const [tab, setTab] = useState("all"); // all | forme
  const [state, setState] = useState("loading"); // loading | ready | error
  const [all, setAll] = useState(null);
  const [forme, setForme] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const loaded = tab === "all" ? all : forme;
    if (loaded !== null) {
      setState("ready");
      return undefined;
    }
    setState("loading");
    const path = tab === "all" ? "/events" : "/events/for-me";
    bfu(path)
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res) ? res : [];
        if (tab === "all") setAll(list);
        else setForme(list);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [tab, all, forme, reloadKey]);

  const list = tab === "all" ? all : forme;

  // Re-attempt the current tab: clear its cache so the effect refetches.
  function retry() {
    if (tab === "all") setAll(null);
    else setForme(null);
    setReloadKey((k) => k + 1);
  }

  const TABS = [
    { id: "all", label: t("community.events.tabAll") },
    { id: "forme", label: t("community.events.tabForMe") },
  ];

  return (
    <div style={{ marginTop: 24 }}>
      {/* Real segmented control: one container, filled active pill distinct from hover. */}
      <div
        role="tablist"
        aria-label={t("community.events.tablistAria")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 4,
          borderRadius: "var(--radius-pill)",
          border: "1px solid var(--hair)",
          background: "var(--surface-2)",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                // Active segment is deliberately larger + solid-amber filled so
                // the chosen side clearly dominates the inactive one at a glance.
                padding: active ? "11px 22px" : "8px 16px",
                borderRadius: "var(--radius-pill)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: active ? 13.5 : 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: active ? "var(--amber)" : "transparent",
                color: active ? "#160E08" : "var(--muted-strong)",
                fontWeight: active ? 800 : 500,
                boxShadow: active ? "0 6px 18px rgba(232,161,92,0.32)" : "none",
                transition: "background 0.15s ease, color 0.15s ease, padding 0.15s ease, font-size 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite">
        {state === "loading" ? (
          <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }}>
            <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
            {t("community.events.loading")}
          </div>
        ) : state === "error" ? (
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ color: "var(--terra)", fontSize: 14 }}>{t("community.events.loadError")}</span>
            <button type="button" onClick={retry} className="ch-btn-ghost">
              {t("community.tryAgain")}
            </button>
          </div>
        ) : !list || list.length === 0 ? (
          <div className="ch-grace" style={{ marginTop: 24 }}>
            <span className="ch-grace-k">{t("community.events.emptyKicker")}</span>
            <div className="ch-grace-t">
              {tab === "forme" ? t("community.events.emptyTitleForMe") : t("community.events.emptyTitleAll")}
            </div>
            <div className="ch-grace-s">
              {tab === "forme"
                ? t("community.events.emptyBodyForMe")
                : t("community.events.emptyBodyAll")}
            </div>
            {tab === "forme" ? (
              <a href="/settings" className="ch-btn-ghost" style={{ marginTop: 14 }}>
                {t("community.events.completeProfile")}
              </a>
            ) : null}
          </div>
        ) : (
          <div className="ch-grid" style={{ marginTop: 24 }}>
            {list.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
