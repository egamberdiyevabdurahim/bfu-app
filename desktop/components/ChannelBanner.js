"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";

// Soft, RECURRING nudge to join the BFU channel. It NEVER blocks: it replaces
// the old hard group-join gate in registration. Dismissal is stored in
// sessionStorage, so it stays gone for the rest of THIS browser session and
// reappears on a later session.
//
// The channel link comes from GET /users/me/groups — the same source the sign-up
// flow used for the group/channel links (the backend fills it from
// TG_OFFICIAL_CHANNEL_LINK / TG_GLOBAL_GROUP_LINK). If none is configured, or the
// user already dismissed it this session, the banner renders nothing.
const DISMISS_KEY = "bfu:channelBannerDismissed";

export default function ChannelBanner() {
  const t = useT();
  const [link, setLink] = useState(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // sessionStorage unavailable (private mode) — treat as not dismissed.
    }
    if (dismissed) return;
    setHidden(false);

    let alive = true;
    bfu("/users/me/groups")
      .then((list) => {
        if (!alive) return;
        const groups = Array.isArray(list) ? list : [];
        // Prefer the Official Channel; then any un-joined link; then any link.
        const pick =
          groups.find((g) => g.group_link && g.name === "Official Channel") ||
          groups.find((g) => g.group_link && !g.joined) ||
          groups.find((g) => g.group_link);
        setLink(pick?.group_link || null);
      })
      .catch(() => {
        // Fail silent — a soft nudge must never surface an error.
      });
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setHidden(true);
  }

  if (hidden || !link) return null;

  return (
    <div
      role="region"
      aria-label={t("misc.channel_banner")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 22,
        padding: "13px 16px",
        borderRadius: "var(--radius)",
        border: "1px solid rgba(232,161,92,0.35)",
        background:
          "linear-gradient(135deg, rgba(232,161,92,0.10), rgba(192,86,59,0.05))",
      }}
    >
      <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
        📣
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 180,
          fontSize: 14,
          lineHeight: 1.45,
          color: "var(--text)",
        }}
      >
        {t("misc.channel_banner")}
      </span>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="ch-btn-primary"
        style={{ flex: "0 0 auto", padding: "8px 16px", fontSize: 13.5 }}
      >
        {t("misc.channel_banner_join")}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("misc.channel_banner_dismiss")}
        title={t("misc.channel_banner_dismiss")}
        style={{
          flex: "0 0 auto",
          width: 32,
          height: 32,
          borderRadius: "var(--radius-sm)",
          background: "transparent",
          border: "1px solid var(--hair)",
          color: "var(--muted-strong)",
          cursor: "pointer",
          fontSize: 15,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
