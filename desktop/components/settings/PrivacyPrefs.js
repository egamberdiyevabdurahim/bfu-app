"use client";

import { useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";
import { useToast } from "@/lib/useToast";

// Who-can-message privacy. Backend gate lives on the DM-open + send endpoints
// (dm_privacy: "everyone" | "connections"); this just sets it via PATCH /users/me.
export default function PrivacyPrefs({ initialDmPrivacy = "everyone" }) {
  const t = useT();
  const [dmPrivacy, setDmPrivacy] = useState(initialDmPrivacy === "connections" ? "connections" : "everyone");
  const [busy, setBusy] = useState(false);
  const { toast, flash } = useToast(3200);

  const choose = async (val) => {
    if (busy || val === dmPrivacy) return;
    const prev = dmPrivacy;
    setBusy(true);
    setDmPrivacy(val); // optimistic
    try {
      const me = await bfu("/users/me", { method: "PATCH", body: { dm_privacy: val } });
      if (me?.dm_privacy) setDmPrivacy(me.dm_privacy);
    } catch {
      setDmPrivacy(prev);
      flash(t("settings.privacy_save_failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column" }}>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: "var(--text)" }}>
          {t("settings.privacy_title")}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5 }}>
          {t("settings.privacy_subtitle")}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{t("settings.privacy_dm_label")}</div>
        <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5 }}>
          {t("settings.privacy_dm_desc")}
        </div>
        <div role="radiogroup" style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {["everyone", "connections"].map((opt) => {
            const on = dmPrivacy === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => choose(opt)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--radius-pill)",
                  cursor: busy ? "default" : "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: on ? "var(--amber)" : "var(--surface-2)",
                  color: on ? "#160E08" : "var(--muted-strong)",
                  border: on ? "1px solid var(--amber)" : "1px solid var(--hair)",
                  fontWeight: on ? 800 : 500,
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                {t(`settings.privacy_dm_${opt}`)}
              </button>
            );
          })}
        </div>
      </div>

      {toast?.text ? (
        <div className="ch-toast ch-toast-show" role="status" aria-live="polite"
          style={{ border: "1px solid rgba(192,86,59,0.5)" }}>
          <span className="ch-toast-tx"><b style={{ color: "var(--terra)" }}>{toast.text}</b></span>
        </div>
      ) : null}
    </div>
  );
}
