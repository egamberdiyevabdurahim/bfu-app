import { useState, useEffect } from "react";
import { mentors, bookings } from "../api";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

const fmtDT = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return ""; } };

const Sheet = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 340, display: "flex", flexDirection: "column" }}>
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} />
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto",
      background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "88dvh",
      display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800 }}>{title}</h2>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 40px" }}>{children}</div>
    </div>
  </div>
);

// ── Mentee books a mentor's open slot ─────────────────────────────────────────
export const BookSlotSheet = ({ mentor, onClose }) => {
  const { t } = useT();
  const [slots, setSlots] = useState(null);
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mentors.slots(mentor.id).then(r => setSlots((r.slots || []).filter(s => s.status === "open")))
      .catch(e => { tgAlert(e.message); setSlots([]); });
  }, [mentor.id]);

  const book = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await bookings.book(picked, note.trim() || null);
      tgAlert(t("booking.booked"));
      onClose();
    } catch (e) { tgAlert(e.message); }
    setBusy(false);
  };

  return (
    <Sheet title={t("mentor.book")} onClose={onClose}>
      {slots === null ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
      ) : slots.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("mentor.noSlots")}</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {slots.map(s => (
              <button key={s.id} onClick={() => setPicked(s.id)} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: "var(--radius-sm)",
                background: picked === s.id ? "var(--accent-dim)" : "var(--surface-2)",
                border: picked === s.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: "var(--text)", fontSize: 13, cursor: "pointer",
              }}>{fmtDT(s.start_at)} · {s.duration_min} min</button>
            ))}
          </div>
          <input value={note} maxLength={200} onChange={e => setNote(e.target.value)}
            placeholder={t("booking.notePh")} style={{ width: "100%", boxSizing: "border-box",
              background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              color: "var(--text)", padding: "10px 12px", fontSize: 13, marginBottom: 10 }} />
          <button onClick={book} disabled={!picked || busy} style={{ width: "100%", background: "var(--accent)",
            border: "none", borderRadius: "var(--radius-sm)", color: "#fff", padding: "12px", fontWeight: 700,
            fontSize: 14, cursor: "pointer" }}>{t("mentor.book")}</button>
        </>
      )}
    </Sheet>
  );
};

// ── Mentor manages their own slots ────────────────────────────────────────────
export const MentorSlotsSheet = ({ onClose }) => {
  const { t } = useT();
  const [slots, setSlots] = useState(null);
  const [newAt, setNewAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    // We need our own id to list slots; fetch it once.
    import("../api").then(({ users }) => users.me()).then(u => {
      setMyId(u.id);
      return mentors.slots(u.id);
    }).then(r => setSlots(r.slots || [])).catch(() => setSlots([]));
  }, []);

  const add = async () => {
    if (!newAt || busy) return;
    setBusy(true);
    try {
      // datetime-local has no timezone; send as ISO (local wall-clock → backend treats as UTC).
      const iso = new Date(newAt).toISOString();
      await mentors.createSlot(iso);
      if (myId) { const r = await mentors.slots(myId); setSlots(r.slots || []); }
      setNewAt("");
    } catch (e) { tgAlert(e.message); }
    setBusy(false);
  };

  const remove = async (id) => {
    try {
      await mentors.deleteSlot(id);
      setSlots(s => (s || []).filter(x => x.id !== id));
    } catch (e) { tgAlert(e.message); }
  };

  return (
    <Sheet title={t("mentor.mySlots")} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input type="datetime-local" value={newAt} onChange={e => setNewAt(e.target.value)}
          style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--text)", padding: "10px 12px", fontSize: 13 }} />
        <button onClick={add} disabled={!newAt || busy} style={{ background: "var(--accent)", border: "none",
          borderRadius: "var(--radius-sm)", color: "#fff", padding: "10px 16px", fontWeight: 700, fontSize: 13,
          cursor: "pointer" }}>{t("mentor.addSlot")}</button>
      </div>
      {slots === null ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
      ) : slots.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("mentor.noSlots")}</div>
      ) : slots.map(s => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--text)" }}>{fmtDT(s.start_at)}
            <span style={{ color: "var(--text-3)", marginLeft: 8, fontSize: 11 }}>· {t(`booking.${s.status}`) || s.status}</span>
          </span>
          {s.status === "open" && (
            <button onClick={() => remove(s.id)} style={{ background: "none", border: "none", color: "#FF6B6B",
              fontSize: 12, cursor: "pointer" }}>{t("booking.cancel")}</button>
          )}
        </div>
      ))}
    </Sheet>
  );
};

// ── Both-sides booking management ─────────────────────────────────────────────
export const BookingsSheet = ({ onClose }) => {
  const { t } = useT();
  const [data, setData] = useState(null);

  const load = () => bookings.mine().then(setData).catch(e => { tgAlert(e.message); setData({ as_mentee: [], as_mentor: [] }); });
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    if (action === "cancel" && !await tgConfirm(t("booking.cancel"))) return;
    try { await bookings.act(id, action); load(); }
    catch (e) { tgAlert(e.message); }
  };

  const Row = ({ b, role }) => (
    <div style={{ padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{b.other?.display_name || ""}</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t(`booking.${b.status}`) || b.status}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{fmtDT(b.start_at)}</div>
      {b.note && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>"{b.note}"</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {role === "mentor" && b.status === "requested" && (
          <>
            <button onClick={() => act(b.id, "confirm")} style={{ background: "var(--accent)", border: "none",
              borderRadius: "var(--radius-sm)", color: "#fff", padding: "6px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer" }}>{t("booking.confirm")}</button>
            <button onClick={() => act(b.id, "decline")} style={{ background: "rgba(255,107,107,0.1)",
              border: "1px solid rgba(255,107,107,0.25)", borderRadius: "var(--radius-sm)", color: "#FF6B6B",
              padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>{t("booking.decline")}</button>
          </>
        )}
        {role === "mentee" && (b.status === "requested" || b.status === "confirmed") && (
          <button onClick={() => act(b.id, "cancel")} style={{ background: "var(--surface-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--text-2)", padding: "6px 14px", fontSize: 12,
            cursor: "pointer" }}>{t("booking.cancel")}</button>
        )}
      </div>
    </div>
  );

  return (
    <Sheet title={t("booking.title")} onClose={onClose}>
      {data === null ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
      ) : (data.as_mentee.length === 0 && data.as_mentor.length === 0) ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("booking.none")}</div>
      ) : (
        <>
          {data.as_mentee.length > 0 && (
            <>
              <div className="section-label">{t("booking.asMentee")}</div>
              {data.as_mentee.map(b => <Row key={b.id} b={b} role="mentee" />)}
            </>
          )}
          {data.as_mentor.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 14 }}>{t("booking.asMentor")}</div>
              {data.as_mentor.map(b => <Row key={b.id} b={b} role="mentor" />)}
            </>
          )}
        </>
      )}
    </Sheet>
  );
};
