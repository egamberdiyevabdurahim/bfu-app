import { redirect, notFound } from "next/navigation";
import { getMe, getToken } from "@/lib/session";
import { PARTNER_ROLE } from "@/components/nav/navConfig";
import AppTopBar from "@/components/nav/AppTopBar";
import PartnerPanel from "@/components/partner/PartnerPanel";

const API_BASE = process.env.BFU_API_URL;

// /partner — the partner org's scoped self-serve panel. SERVER wrapper:
//   1. no session cookie  → /login (middleware already redirects; this is belt).
//   2. authed but role !== "partner" → notFound(): a normal member is sent away
//      and the panel's very existence stays hidden. The backend /partner/*
//      router 403s anyway, so this is defence-in-depth, not the only gate.
//   3. partner → render the panel over its OWN events only.
// Per-user + cookie-bound → never cacheable.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Partner panel — Bright Futures Uzbekistan",
  description: "Post opportunities, build their registration forms, and read who signed up — for your organisation.",
};

// Authed server-side GET (Bearer from the session cookie). Returns null on any
// failure so the page still renders — the panel falls back to a generic org
// label and the events list loads on the client regardless.
async function authedGet(path, token) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function PartnerPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== PARTNER_ROLE) notFound();

  const token = await getToken();
  // GET /partner/me → the org record (name/about/logo) for the panel header.
  const org = await authedGet("/partner/me", token);

  return (
    <AppTopBar active="partner-panel" me={me}>
      <PartnerPanel org={org} />
    </AppTopBar>
  );
}
