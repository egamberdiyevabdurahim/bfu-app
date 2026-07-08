"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/i18n/LocaleProvider";
import { LANGS, LANG_LABELS, LANG_SHORT } from "@/lib/i18n/config";

// Compact language pill + popover. Shows the current short code (UZ/RU/EN); the
// menu lists the three native names. Selecting one writes the cookie and
// refreshes server components (see LocaleProvider.setLang).
//
// `variant="rail"` is the sidebar-footer style (full-width row); `variant="pill"`
// is a small inline pill (e.g. a public top bar).
export default function LanguageSwitcher({ variant = "rail" }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next) {
    setOpen(false);
    if (next !== lang) setLang(next);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: variant === "rail" ? "space-between" : "center",
          gap: 8,
          width: variant === "rail" ? "100%" : "auto",
          padding: variant === "rail" ? "9px 11px" : "6px 10px",
          borderRadius: 10,
          border: "1px solid var(--hair)",
          background: open ? "var(--surface-2)" : "transparent",
          color: "var(--muted-strong)",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ opacity: 0.7, fontSize: 12 }}>🌐</span>
          <span style={{ textTransform: "uppercase" }}>{LANG_SHORT[lang]}</span>
        </span>
        <span aria-hidden style={{ opacity: 0.6, fontSize: 10 }}>{open ? "▲" : "▾"}</span>
      </button>

      {open ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            bottom: variant === "rail" ? "calc(100% + 6px)" : "auto",
            top: variant === "rail" ? "auto" : "calc(100% + 6px)",
            left: 0,
            right: 0,
            minWidth: 150,
            background: "var(--surface)",
            border: "1px solid var(--hair)",
            borderRadius: 12,
            padding: 6,
            boxShadow: "0 12px 34px rgba(0,0,0,0.45)",
            zIndex: 80,
          }}
        >
          {LANGS.map((code) => {
            const active = code === lang;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(code)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: active ? "var(--surface-2)" : "transparent",
                  color: active ? "var(--text)" : "var(--muted-strong)",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--surface-2)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{LANG_LABELS[code]}</span>
                <span
                  aria-hidden
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: active ? "var(--ember)" : "var(--muted)",
                  }}
                >
                  {LANG_SHORT[code]}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
