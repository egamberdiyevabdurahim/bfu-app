"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";

// The broadcast composer for /dashboard/broadcast.
//
// POST /admin/broadcast is SUPER-ADMIN only. Body (BroadcastBody):
//   { text, region_id?: int|null, verified_only?: bool, dry_run: bool }
// Two-step per the backend + the Vite app's confirm pattern:
//   1. dry_run:true  → { dry_run:true, count }   (how many would receive it)
//   2. dry_run:false → { queued }                (fire-and-forget send)
// We surface the count in a confirmation panel ("Send to N members?") before the
// real send. Plain admins (non-super) see a "super-admins only" note instead.
//
// Regions for the audience filter come from GET /admin/regions (RegionOut[]:
// id, name_en, name_uz, name_ru).

const MAX = 3500; // mirrors the backend cap

export default function AdminBroadcast({ me }) {
  const isSuper = me?.role === "super_admin";
  const { showToast, Toast } = useToast();

  const [text, setText] = useState("");
  const [regionId, setRegionId] = useState(""); // "" = all regions
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [regions, setRegions] = useState([]);
  const [pending, setPending] = useState(null); // { count } once dry-run returns
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isSuper) return;
    let alive = true;
    bfu("/admin/regions")
      .then((r) => alive && setRegions(Array.isArray(r) ? r : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isSuper]);

  if (!isSuper) {
    return (
      <div style={{ marginTop: 28 }}>
        <section
          className="ch-cell"
          style={{
            padding: 32,
            background: "linear-gradient(150deg, rgba(232,161,92,0.08), rgba(192,86,59,0.04) 60%, var(--surface))",
            borderColor: "rgba(232,161,92,0.28)",
          }}
        >
          <div className="ch-cell-label">Restricted</div>
          <h2 style={{ margin: "10px 0 8px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, color: "var(--text)" }}>
            Broadcasts are <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", color: "var(--amber)" }}>super-admins only</span>
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: "var(--muted)", maxWidth: 520, lineHeight: 1.5 }}>
            Sending a message to the whole bazaar is a founder-level lever. You can still manage users,
            moderate projects, and clear reports from the other tabs.
          </p>
        </section>
        <Toast />
      </div>
    );
  }

  function body(dryRun) {
    return {
      text: text.trim(),
      region_id: regionId ? Number(regionId) : null,
      verified_only: verifiedOnly,
      dry_run: dryRun,
    };
  }

  // Step 1 — ask the backend how many recipients this audience has.
  async function preview() {
    const t = text.trim();
    if (!t) return showToast("Write a message first", "err");
    if (t.length > MAX) return showToast(`Too long — max ${MAX} chars`, "err");
    setChecking(true);
    try {
      const res = await bfu("/admin/broadcast", { method: "POST", body: body(true) });
      setPending({ count: res?.count ?? 0 });
    } catch (e) {
      showToast(e.message || "Couldn't check the audience", "err");
    } finally {
      setChecking(false);
    }
  }

  // Step 2 — actually queue the send.
  async function send() {
    setSending(true);
    try {
      const res = await bfu("/admin/broadcast", { method: "POST", body: body(false) });
      showToast(`Queued to ${res?.queued ?? 0} member(s) — Telegram delivery is in progress`);
      setPending(null);
      setText("");
    } catch (e) {
      showToast(e.message || "Couldn't send", "err");
    } finally {
      setSending(false);
    }
  }

  const regionName = (r) => r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`;
  const audienceLabel =
    (regionId ? regionName(regions.find((r) => String(r.id) === String(regionId)) || { id: regionId }) : "All regions") +
    (verifiedOnly ? " · verified only" : "");

  return (
    <div style={{ marginTop: 28, maxWidth: 720 }}>
      <section className="ch-cell" style={{ padding: 28 }}>
        <div className="ch-cell-label" style={{ marginBottom: 12 }}>Compose</div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPending(null); // any edit invalidates a prior preview
          }}
          placeholder="Your announcement to the whole bazaar…"
          rows={6}
          maxLength={MAX + 200}
          style={{ ...inputStyle, width: "100%", resize: "vertical", fontSize: 15, lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: text.length > MAX ? "var(--terra)" : "var(--muted)" }}>
            {text.length} / {MAX}
          </span>
        </div>

        {/* Audience */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
              Region
            </span>
            <select
              value={regionId}
              onChange={(e) => {
                setRegionId(e.target.value);
                setPending(null);
              }}
              style={selectStyle}
            >
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{regionName(r)}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--muted)", cursor: "pointer", marginTop: 20 }}>
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => {
                setVerifiedOnly(e.target.checked);
                setPending(null);
              }}
            />
            Verified builders only
          </label>
        </div>

        {/* Confirmation step */}
        {!pending ? (
          <div style={{ marginTop: 22 }}>
            <button
              type="button"
              className="ch-btn-primary"
              onClick={preview}
              disabled={checking || !text.trim() || text.length > MAX}
              style={{ padding: "11px 22px" }}
            >
              {checking ? "Checking audience…" : "Preview recipients →"}
            </button>
          </div>
        ) : (
          <div
            style={{
              marginTop: 22,
              padding: 20,
              borderRadius: 14,
              border: "1px solid rgba(232,161,92,0.35)",
              background: "linear-gradient(150deg, rgba(232,161,92,0.10), rgba(192,86,59,0.05) 60%, var(--surface))",
            }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text)" }}>
              Send to <span style={{ color: "var(--amber)" }}>{pending.count.toLocaleString("en-US")}</span> member{pending.count === 1 ? "" : "s"}?
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              Audience: {audienceLabel}. This delivers a Telegram message and can't be recalled.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                className="ch-btn-primary"
                onClick={send}
                disabled={sending || pending.count === 0}
                style={{ padding: "10px 20px" }}
              >
                {sending ? "Sending…" : `📣 Send to ${pending.count.toLocaleString("en-US")}`}
              </button>
              <button type="button" className="ch-btn-ghost" onClick={() => setPending(null)} disabled={sending}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <Toast />
    </div>
  );
}

const inputStyle = {
  fontFamily: "var(--font-body)", color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "12px 14px", outline: "none",
};

const selectStyle = {
  fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "9px 12px", cursor: "pointer", minWidth: 200,
};
