import { useState, useEffect } from "react";
import { users } from "../api";
import { Icon } from "./Icons";
import { useT } from "../i18n";

// ── Notification preferences (Telegram push opt-out toggles) ──────────────────
// Full-screen overlay. GET /users/me/notification-prefs → { prefs: {...bools} };
// PATCH the same with a single-key diff (optimistic, reconcile on response).
// `telegram_push` is the master switch that gates the 6 category toggles.

const CATEGORIES = [
  { key: "messages",        glyph: "💬" },
  { key: "interest",        glyph: "💜" },
  { key: "applications",    glyph: "✒" },
  { key: "project_updates", glyph: "◆" },
  { key: "bookings",        glyph: "◷" },
  { key: "events",          glyph: "📅" },
  { key: "weekly_digest",   glyph: "📰" },
];

const Switch = ({ on, disabled, onClick }) => (
  <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick} style={{
    flex: "0 0 auto", width: 46, height: 28, borderRadius: 99, border: "none", cursor: disabled ? "default" : "pointer",
    background: on ? "linear-gradient(135deg, var(--amber), var(--ember))" : "var(--surface-3, #2A2620)",
    opacity: disabled ? 0.4 : 1, position: "relative", transition: "background 0.2s",
  }}>
    <span style={{
      position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: "50%",
      background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
    }} />
  </button>
);

export const NotificationPrefsSheet = ({ onClose }) => {
  const { t } = useT();
  const [prefs, setPrefs] = useState(null);
  const [dmPrivacy, setDmPrivacy] = useState("everyone");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([users.notificationPrefs(), users.me().catch(() => null)])
      .then(([r, me]) => {
        setPrefs(r?.prefs || {});
        if (me?.dm_privacy) setDmPrivacy(me.dm_privacy);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const master = prefs?.telegram_push !== false;

  const setPrivacy = async (val) => {
    const prev = dmPrivacy;
    setDmPrivacy(val); // optimistic
    try {
      const me = await users.updateMe({ dm_privacy: val });
      if (me?.dm_privacy) setDmPrivacy(me.dm_privacy);
      window.dispatchEvent(new CustomEvent("bfu:me-updated"));
    } catch {
      setDmPrivacy(prev);
    }
  };

  const toggle = async (key) => {
    const current = prefs[key] !== false;
    const next = !current;
    setPrefs((p) => ({ ...p, [key]: next }));  // optimistic
    try {
      const r = await users.updateNotificationPrefs({ [key]: next });
      if (r?.prefs) setPrefs(r.prefs);          // reconcile
    } catch {
      setPrefs((p) => ({ ...p, [key]: current })); // revert
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 260, background: "var(--bg)",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
      "--muted": "#A8A093", "--muted-strong": "#C6BEAF",
    }}>
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12,
        padding: "calc(var(--safe-t) + 14px) 16px 14px", borderBottom: "1px solid var(--hair)",
      }}>
        <button onClick={onClose} aria-label={t("common.close")} style={{
          width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
          background: "var(--surface-2)", color: "var(--muted-strong)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><Icon name="x" size={18} /></button>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, color: "var(--text)" }}>
          {t("notif.title")}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "18px 16px 40px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 50, color: "var(--text-3)" }}>
            <Icon name="loader" size={22} color="var(--amber)" />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--terra)", fontSize: 14 }}>{t("common.loadError")}</div>
        ) : (
          <>
            {/* Master telegram push */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 16px",
              background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: "var(--radius)",
            }}>
              <span style={{ fontSize: 22 }} aria-hidden>🔔</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                  {t("notif.master")}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted-strong)", marginTop: 3, lineHeight: 1.4 }}>
                  {t("notif.masterHint")}
                </div>
              </div>
              <Switch on={master} onClick={() => toggle("telegram_push")} />
            </div>

            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--muted)", margin: "22px 4px 10px" }}>
              {t("notif.categories")}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CATEGORIES.map((c) => {
                const on = prefs[c.key] !== false;
                return (
                  <div key={c.key} style={{
                    display: "flex", alignItems: "center", gap: 13, padding: "13px 15px",
                    background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)",
                    opacity: master ? 1 : 0.5,
                  }}>
                    <span style={{ fontSize: 17, width: 22, textAlign: "center" }} aria-hidden>{c.glyph}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: "var(--text)" }}>
                      {t(`notif.cat.${c.key}`)}
                    </span>
                    <Switch on={on && master} disabled={!master} onClick={() => toggle(c.key)} />
                  </div>
                );
              })}
            </div>

            {!master && (
              <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--muted-strong)", textAlign: "center", lineHeight: 1.5 }}>
                {t("notif.mutedNote")}
              </div>
            )}

            {/* Privacy — who can start a DM with you */}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--muted)", margin: "26px 4px 10px" }}>
              {t("privacy.section")}
            </div>
            <div style={{ padding: "13px 15px", background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text)" }}>{t("privacy.whoCanMessage")}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted-strong)", marginTop: 3, lineHeight: 1.4 }}>{t("privacy.whoCanMessageHint")}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                {["everyone", "connections"].map((opt) => {
                  const on = dmPrivacy === opt;
                  return (
                    <button key={opt} onClick={() => setPrivacy(opt)} style={{
                      flex: 1, padding: "9px 10px", borderRadius: "var(--radius-pill)", cursor: "pointer",
                      fontFamily: "var(--font-mono)", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase",
                      background: on ? "var(--amber)" : "var(--surface)", color: on ? "#160E08" : "var(--muted-strong)",
                      border: on ? "1px solid var(--amber)" : "1px solid var(--hair)", fontWeight: on ? 700 : 500,
                      transition: "background 0.15s ease, color 0.15s ease",
                    }}>{t(`privacy.dm.${opt}`)}</button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
