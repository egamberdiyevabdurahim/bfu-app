"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";

// Share control for the event detail page. Copies the PUBLIC landing-page link
// (brightfuturesuzbekistan.uz/e/{id}) — the shareable, preview-rich URL for
// Instagram/anywhere. That page shows the event to logged-out visitors and its
// Register button opens Telegram straight onto sign-up. Client-only (needs
// navigator.clipboard + local state); the rest of the page is SSR.
export default function CopyEventLink({ eventId }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = `https://brightfuturesuzbekistan.uz/e/${eventId}`;

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
