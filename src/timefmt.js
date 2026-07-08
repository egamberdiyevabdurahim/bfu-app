// ── Single source of truth for time display — always Asia/Tashkent (UTC+5) ────
// The backend serializes NAIVE UTC datetimes (no tz suffix), so we append "Z"
// to force UTC parsing, then render in Tashkent time regardless of the viewer's
// device clock. Use these everywhere instead of raw `new Date(iso).toLocale*`.

const TZ = "Asia/Tashkent";

// Parse a backend timestamp as UTC (append Z when it has no tz info).
const parse = (iso) => {
  if (!iso) return null;
  let s = String(iso);
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
};

// "5 Jul 2026"
export const fmtDate = (iso) => {
  const d = parse(iso); if (!d) return "";
  try { return d.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
};

// "5 Jul"
export const fmtDay = (iso) => {
  const d = parse(iso); if (!d) return "";
  try { return d.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" }); }
  catch { return ""; }
};

// "14:30" (Tashkent)
export const fmtTime = (iso) => {
  const d = parse(iso); if (!d) return "";
  try { return d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

// "5 Jul · 14:30"
export const fmtDateTime = (iso) => {
  const d = parse(iso); if (!d) return "";
  const day = fmtDate(iso), time = fmtTime(iso);
  return time ? `${day} · ${time}` : day;
};

// Compact relative ("now", "5m", "3h", "2d", else "5 Jul"). Elapsed math is
// timezone-agnostic (both instants are absolute); only the >7d fallback is
// rendered in Tashkent.
export const relTime = (iso) => {
  const d = parse(iso); if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 45) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24); if (dd < 7) return `${dd}d`;
  return fmtDay(iso);
};
