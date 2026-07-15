"use client";

import { useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LocaleProvider";
import EventFormModal from "@/components/events/EventFormModal";

// The one interactive control on the event detail page (the rest is SSR). Mirrors
// EventsBrowser's RsvpRow wiring so both surfaces behave identically:
//   • has_form false → a 1-click RSVP (POST/DELETE /events/{id}/rsvp), optimistic,
//   • has_form true  → "Register" opens EventFormModal (editable form); once
//                      registered the pill opens the READ-ONLY view instead. The
//                      feed is patched only after the SERVER accepts the answers.
// There is no "Interested" — members can only Register/Go for v1.
export default function EventDetailRegister({ event, meId = null }) {
  const t = useT();
  const { toast, flash } = useToast(3200);
  const [ev, setEv] = useState(event);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reconcile — shared with the modal via onRsvp(id, patch).
  const patch = (_id, p) => setEv((e) => ({ ...e, ...p }));

  const going = ev.my_rsvp === "going";
  const waitlisted = ev.my_rsvp === "waitlisted";
  const registered = going || waitlisted;

  async function toggle() {
    if (busy) return;
    // Form events hand off to the modal — both when registering (editable) and
    // when already registered (read-only). Withdraw for those lives in the modal.
    if (ev.has_form) {
      setFormOpen(true);
      return;
    }
    setBusy(true);
    const prev = { my_rsvp: ev.my_rsvp, rsvp_count: ev.rsvp_count };
    const toggleOff = registered;
    const nextStatus = toggleOff ? null : "going";
    const delta = (nextStatus === "going" ? 1 : 0) - (going ? 1 : 0);
    setEv((e) => ({ ...e, my_rsvp: nextStatus, rsvp_count: Math.max(0, (e.rsvp_count || 0) + delta) }));
    try {
      const r = toggleOff
        ? await bfu(`/events/${ev.id}/rsvp`, { method: "DELETE" })
        : await bfu(`/events/${ev.id}/rsvp`, { method: "POST", body: { status: "going" } });
      setEv((e) => ({ ...e, my_rsvp: r.my_rsvp, rsvp_count: r.rsvp_count }));
    } catch {
      setEv((e) => ({ ...e, ...prev }));
    } finally {
      setBusy(false);
    }
  }

  const base = {
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderRadius: "var(--radius-pill)",
    fontSize: 12.5,
    padding: "12px 22px",
    cursor: busy ? "default" : "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
  };
  const activePill = {
    background: "var(--amber)",
    color: "#160E08",
    border: "1px solid var(--amber)",
    fontWeight: 800,
    boxShadow: "0 4px 14px rgba(232,161,92,0.28)",
  };
  const idlePill = {
    background: "var(--surface-2)",
    color: "var(--muted-strong)",
    border: "1px solid var(--hair)",
    fontWeight: 500,
  };
  const waitPill = { ...idlePill, background: "transparent", color: "var(--amber)", border: "1px solid var(--amber)", fontWeight: 800 };

  const label = waitlisted
    ? t("community.events.rsvpWaitlisted")
    : going
      ? t("community.events.registeredPill")
      : ev.has_form
        ? t("community.events.rsvpRegister")
        : t("community.events.rsvpGoing");
  const glyph = waitlisted ? "◔ " : going ? "✓ " : "";

  return (
    <div className="ch-cell-static" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="ch-cell-label">{t("community.events.detail.registerLabel")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          style={{ ...base, ...(waitlisted ? waitPill : registered ? activePill : idlePill) }}
        >
          {glyph}
          {label}
        </button>
        {ev.rsvp_count > 0 ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
            {t("community.events.goingCount", { n: ev.rsvp_count })}
          </span>
        ) : null}
      </div>

      {registered && ev.has_form ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "var(--amber)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {t("community.events.viewRegistration")}
        </button>
      ) : null}

      {formOpen ? (
        <EventFormModal
          event={ev}
          meId={meId}
          onRsvp={patch}
          onClose={(reason) => {
            setFormOpen(false);
            if (reason === "registered") flash(t("community.events.form.toastRegistered"), "ok");
            else if (reason === "updated") flash(t("community.events.form.toastUpdated"), "ok");
            else if (reason === "withdrawn") flash(t("community.events.form.toastWithdrawn"), "ok");
          }}
        />
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}
