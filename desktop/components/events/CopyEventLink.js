"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";

// Share control for the event detail page. Builds the Telegram deep-link that
// opens the Mini App straight onto this event (?startapp=event_{id}) and copies
// it to the clipboard on click, flashing "Copied!" for ~1.5s. Client-only (needs
// navigator.clipboard + local state); the rest of the page is SSR.
const BOT = process.env.NEXT_PUBLIC_BOT_USERNAME || "BrightFuturesUzbekistan_bot";

export default function CopyEventLink({ eventId }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = `https://t.me/${BOT}?startapp=event_${eventId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure ctx / permission) — no-op, stays idle */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="ch-btn-ghost"
      style={{ width: "100%", justifyContent: "center" }}
    >
      <span aria-hidden>🔗</span>{" "}
      {copied ? t("community.events.detail.linkCopied") : t("community.events.detail.copyLink")}
    </button>
  );
}
