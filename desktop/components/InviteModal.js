"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LocaleProvider";

// Small in-place invite dialog. Replaces the old "Invite a friend" → /web/settings
// hop out of the City grace tile (RegionCluster.js): the reader stays on the page
// they were reading, copies the link, and closes.
//
// Mirrors the Mini App's InviteSheet (src/components/InviteSheet.jsx) in behaviour
// and the desktop's existing dialog grammar in shape:
//   • overlay + centered .ch-cell panel + backdrop-click-to-close — same as the
//     shared Modal in components/dashboard/AdminEvents.js (role/aria-modal/z-90),
//   • Escape closes,
//   • the invite link + Copy button reuse ProfileEditor's copy path verbatim
//     (GET /users/me/invite → res.link → navigator.clipboard.writeText).
//
// LAZY BY CONSTRUCTION: the fetch lives in a mount effect, and the caller mounts
// this component only while the modal is open ({open && <InviteModal …/>}), so
// nothing is requested on page load — only on the click that opens the dialog.
//
// States are honest: loading spinner → error line + Try again → the real link.
// There is never a placeholder/fake link on screen; the Copy button stays
// disabled until a link actually arrives.

export default function InviteModal({ onClose }) {
  const t = useT();
  const { toast, flash } = useToast(2600);

  const [data, setData] = useState(null); // { link, invited_count } | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const closeRef = useRef(null);
  const aliveRef = useRef(true);
  // Restore focus to whatever opened us (the grace tile's Invite button).
  const openerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await bfu("/users/me/invite");
      if (!aliveRef.current) return;
      const link = res?.link || "";
      if (!link) throw new Error(t("settings.invite_none"));
      setData({ link, invited_count: res?.invited_count });
    } catch (err) {
      if (!aliveRef.current) return;
      setData(null);
      setError(err?.message || t("settings.invite_load_failed"));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [t]);

  // Mount === open. One fetch, cancelled (state-wise) if the reader closes early.
  useEffect(() => {
    aliveRef.current = true;
    openerRef.current =
      typeof document !== "undefined" ? document.activeElement : null;
    load();
    closeRef.current?.focus();
    return () => {
      aliveRef.current = false;
      openerRef.current?.focus?.();
    };
    // `load` is stable per locale; re-running it on a language switch mid-dialog
    // is harmless (same endpoint) but pointless, so key the effect to mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      flash(t("settings.invite_copied"), "ok");
    } catch {
      flash(t("settings.invite_copy_failed"), "err");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.invite_section_label")}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(6,5,4,0.7)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell-static"
        style={{
          width: "100%",
          maxWidth: 480,
          padding: 26,
          background: "var(--surface)",
          margin: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ch-cell-label">{t("settings.invite_section_label")}</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: "var(--muted-strong)",
              }}
            >
              {t("settings.invite_section_hint")}
            </div>
          </div>
          <button
            type="button"
            ref={closeRef}
            className="ch-btn-ghost"
            onClick={onClose}
            aria-label={t("common.close")}
            style={{ padding: "6px 12px", fontSize: 13, flex: "0 0 auto" }}
          >
            ✕
          </button>
        </div>

        {/* Link box — loading / error / real link. Never a fake placeholder. */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: data?.link ? "var(--muted-strong)" : "var(--muted)",
            fontStyle: data?.link ? "normal" : "italic",
            wordBreak: "break-all",
            background: "var(--surface-2)",
            border: "1px solid var(--hair)",
            borderRadius: "var(--radius-sm)",
            padding: "11px 13px",
            minHeight: 42,
          }}
        >
          {loading
            ? t("settings.invite_preparing")
            : data?.link
              ? data.link
              : error || t("settings.invite_none")}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {error && !loading ? (
            <button type="button" className="ch-btn-primary" onClick={load}>
              {t("settings.invite_retry")}
            </button>
          ) : (
            <button
              type="button"
              className="ch-btn-primary"
              onClick={copy}
              disabled={!data?.link}
              style={{
                opacity: data?.link ? 1 : 0.55,
                cursor: data?.link ? "pointer" : "default",
              }}
            >
              {t("settings.invite_copy_button")}
            </button>
          )}

          {data?.invited_count != null ? (
            <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
              {t("settings.invited_count", { n: data.invited_count })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Toast lives INSIDE the overlay's stacking context so the "Copied" pill
          paints above the dim backdrop instead of behind it. stopPropagation so
          a click on the pill doesn't read as a backdrop click and close us. */}
      <div onClick={(e) => e.stopPropagation()}>
        <Toast toast={toast} />
      </div>
    </div>
  );
}
