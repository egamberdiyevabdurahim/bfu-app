"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useToast } from "@/lib/useToast";
import { useT } from "@/components/i18n/LocaleProvider";
import { fmtDate, fromTashkentInput } from "@/lib/datetime";

// Partner detail (Batch 4). Loads, for a given partner id:
//   GET /partners/{id}   → { id, name, about, website, logo_url, region_id,
//                            verified, events:[{id,type,title,description,link,
//                            deadline}] }
//   GET /partners/mine   → { partner: {...} | null }  (the org THIS user manages)
// If /mine's partner id === this partner id, the current user owns it, so we show
// the "Post an opportunity" form → POST /partners/mine/opportunity, whose body is
// (confirmed in partners.py OpportunityIn):
//   { type, title, description?, link?, deadline?, region_id? }
// New opportunities are created is_approved=false (pending admin), so they won't
// appear in the events list here until approved — we surface that in the toast.

const TYPES = ["hackathon", "grant", "scholarship", "meetup", "other"];

const TYPE_STYLE = {
  hackathon: { color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  grant: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  scholarship: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  meetup: { color: "var(--teal-bright)", bg: "rgba(94,197,182,0.14)", bd: "rgba(94,197,182,0.34)" },
};
const DEFAULT_TYPE = { color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" };

// Deadlines are NAIVE-UTC; render date-only in Tashkent via the shared helper.
function fmtDeadline(iso) {
  return fmtDate(iso) || null;
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--hair)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "10px 12px",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};
const labelStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--muted-strong)",
  margin: "0 0 8px",
};

function OpportunityCard({ ev }) {
  const t = useT();
  const ts = TYPE_STYLE[ev.type] || DEFAULT_TYPE;
  const deadline = fmtDeadline(ev.deadline);
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            padding: "5px 11px",
            borderRadius: "var(--radius-pill)",
            background: ts.bg,
            border: `1px solid ${ts.bd}`,
            color: ts.color,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {ev.type || t("community.events.typeFallback")}
        </span>
        {deadline ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)" }}>{t("community.events.by", { date: deadline })}</span>
        ) : null}
      </div>
      <h3 style={{ margin: "12px 0 0", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>
        {ev.title}
      </h3>
      {ev.description ? (
        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--muted)" }}>{ev.description}</p>
      ) : null}
      {ev.link ? (
        <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--amber)" }}>
          {t("community.openDetails")}
        </div>
      ) : null}
    </>
  );
  const style = { display: "block", padding: 24, color: "var(--text)", textDecoration: "none" };
  return ev.link ? (
    <a href={ev.link} target="_blank" rel="noopener noreferrer" className="ch-cell" style={style}>
      {inner}
    </a>
  ) : (
    <div className="ch-cell-static" style={style}>
      {inner}
    </div>
  );
}

function PostForm({ onPosted, flash }) {
  const t = useT();
  const [type, setType] = useState("hackathon");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [deadline, setDeadline] = useState(""); // yyyy-mm-dd
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) {
      flash(t("community.opp.needTitle"), "err");
      return;
    }
    setBusy(true);
    // deadline is a date input → send as end-of-day, interpreted as Tashkent
    // (fixed +05:00, not the browser's zone) so the stored instant is correct
    // regardless of where the admin is; omit when blank.
    const body = {
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      link: link.trim() || undefined,
      deadline: deadline ? fromTashkentInput(`${deadline}T23:59:00`) : undefined,
    };
    try {
      await bfu("/partners/mine/opportunity", { method: "POST", body });
      flash(t("community.opp.submitted"));
      setTitle("");
      setDescription("");
      setLink("");
      setDeadline("");
      setType("hackathon");
      onPosted?.();
    } catch (err) {
      flash(err?.message || t("community.opp.submitError"), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ch-cell-static" style={{ marginTop: 4, background: "linear-gradient(155deg, rgba(232,161,92,0.06), var(--surface) 60%)" }}>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>{t("community.opp.typeLabel")}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`community.opp.type.${ty}`)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>{t("community.opp.deadlineLabel")}</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t("community.opp.titleLabel")}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 160))}
            placeholder={t("community.opp.titlePlaceholder")}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("community.opp.descLabel")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("community.opp.descPlaceholder")}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("community.opp.linkLabel")}</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" style={inputStyle} />
        </div>
        <div>
          <button type="submit" className="ch-btn-primary" disabled={busy || !title.trim()} style={{ opacity: busy || !title.trim() ? 0.6 : 1 }}>
            {busy ? t("community.opp.submitting") : t("community.opp.postOpportunity")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PartnerDetail({ partnerId }) {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | notfound | error
  const [partner, setPartner] = useState(null);
  const [owns, setOwns] = useState(false);
  const { toast, flash } = useToast(3500);

  useEffect(() => {
    let alive = true;
    Promise.all([
      bfu(`/partners/${partnerId}`),
      bfu("/partners/mine").catch(() => ({ partner: null })),
    ])
      .then(([p, mine]) => {
        if (!alive) return;
        setPartner(p);
        // Compare as strings — ids may arrive as number or string from either source.
        setOwns(Boolean(mine?.partner && String(mine.partner.id) === String(partnerId)));
        setState("ready");
      })
      .catch((e) => {
        if (!alive) return;
        setState(e?.status === 404 ? "notfound" : "error");
      });
    return () => {
      alive = false;
    };
  }, [partnerId]);

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }} role="status" aria-live="polite">
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("community.partnerDetail.loading")}
      </div>
    );
  }
  if (state === "notfound") {
    return (
      <div className="ch-grace" style={{ marginTop: 24 }}>
        <span className="ch-grace-k">{t("community.partnerDetail.notFoundKicker")}</span>
        <div className="ch-grace-t">{t("community.partnerDetail.notFoundTitle")}</div>
        <div className="ch-grace-s">{t("community.partnerDetail.notFoundBody")}</div>
        <a href="/web/partners" className="ch-btn-ghost" style={{ marginTop: 12 }}>
          {t("community.partnerDetail.back")}
        </a>
      </div>
    );
  }
  if (state === "error" || !partner) {
    return (
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }} role="status" aria-live="polite">
        <span style={{ color: "var(--terra)", fontSize: 14 }}>{t("community.partnerDetail.loadError")}</span>
        <button type="button" onClick={() => window.location.reload()} className="ch-btn-ghost">
          {t("community.tryAgain")}
        </button>
      </div>
    );
  }

  const events = Array.isArray(partner.events) ? partner.events : [];

  return (
    <div style={{ marginTop: 24 }}>
      {/* Partner header card — passive info panel, no hover glow */}
      <div className="ch-cell-static" style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            flex: "0 0 auto",
            background: partner.logo_url ? "var(--surface-2)" : gradientFor(partner.id),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 26,
            color: "#160E08",
            overflow: "hidden",
          }}
        >
          {partner.logo_url ? (
            <img src={partner.logo_url} alt={partner.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 16 }} />
          ) : (
            initials(partner.name)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(22px, 4vw, 28px)",
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                overflowWrap: "anywhere",
              }}
            >
              {partner.name}
            </h1>
            {partner.verified ? (
              <span role="img" aria-label={t("community.partners.verified")} style={{ color: "var(--green)", fontSize: 14 }}>✓</span>
            ) : null}
          </div>
          {partner.about ? (
            <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--muted)" }}>{partner.about}</p>
          ) : null}
          {partner.website ? (
            <a
              href={partner.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", textDecoration: "none" }}
            >
              {partner.website.replace(/^https?:\/\//, "")} →
            </a>
          ) : null}
        </div>
      </div>

      {/* Owner-only: post an opportunity */}
      {owns ? (
        <section style={{ marginTop: 8 }}>
          <div className="ch-slab">
            <span className="ch-slab-k">{t("community.partnerDetail.manageKicker")}</span>
            <h2>{t("community.partnerDetail.postTitle")}</h2>
            <span className="ch-slab-line" />
          </div>
          <PostForm flash={flash} />
        </section>
      ) : null}

      {/* Opportunities */}
      <section>
        <div className="ch-slab">
          <span className="ch-slab-k">{t("community.partnerDetail.offeringKicker")}</span>
          <h2>{t("community.partnerDetail.opportunitiesTitle")}</h2>
          <span className="ch-slab-line" />
        </div>
        {events.length === 0 ? (
          <div className="ch-grace">
            <span className="ch-grace-k">{t("community.partnerDetail.emptyKicker")}</span>
            <div className="ch-grace-t">{t("community.partnerDetail.emptyTitle")}</div>
            <div className="ch-grace-s">
              {owns
                ? t("community.partnerDetail.emptyBodyOwner")
                : t("community.partnerDetail.emptyBody")}
            </div>
          </div>
        ) : (
          <div className="ch-grid">
            {events.map((ev) => (
              <OpportunityCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </section>

      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          style={{ borderColor: toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)" }}
        >
          <span className="ch-toast-tx" style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}>
            {toast.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
