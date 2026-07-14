// ── Shared Tashkent date/time helper for the desktop web app ──────────────────
// The backend serializes NAIVE UTC datetimes (no tz suffix, e.g.
// "2026-08-05T10:00:00"). A bare `new Date(iso)` misreads those as the browser's
// local time, so every event/deadline/submitted-at display would drift by the
// viewer's offset. This module is the single source of truth: parse backend
// timestamps as UTC, render them in Asia/Tashkent, and convert datetime-local
// inputs to/from Tashkent wall-clock regardless of the admin's browser timezone.
//
// Mirrors the Mini App's src/timefmt.js and the reference fmtStart() that lived
// in components/community/EventsBrowser.js. Use these everywhere instead of raw
// `new Date(iso).toLocale*` or `new Date(local).toISOString()`.

const TZ = "Asia/Tashkent";
const LOCALE = "en-GB";

// Tashkent is a FIXED UTC+5 offset (no daylight saving), so the conversion math
// is a constant — we never have to worry about a DST discontinuity.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const DATE_OPTS = { day: "numeric", month: "short", year: "numeric" };
const TIME_OPTS = { hour: "2-digit", minute: "2-digit" };

// Parse a backend timestamp as UTC. When the string carries no timezone info
// (no Z / no ±hh:mm), append "Z" so it's read as UTC rather than browser-local.
// Returns null for empty/invalid input so callers can gate on a falsy result.
export function parseUTC(iso) {
  if (!iso) return null;
  let s = String(iso);
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Core formatter: render a backend UTC timestamp in Tashkent with the given Intl
// options (via toLocaleString, so both date-only and date+time option sets work).
// Returns "" for empty/invalid input.
export function fmtTashkent(iso, opts = {}, locale = LOCALE) {
  const d = parseUTC(iso);
  if (!d) return "";
  try {
    return d.toLocaleString(locale, { timeZone: TZ, ...opts });
  } catch {
    return "";
  }
}

// Date-only variant, "5 Jul 2026" (Tashkent). Pass `opts` to override the fields.
export function fmtDate(iso, opts) {
  return fmtTashkent(iso, opts || DATE_OPTS);
}

// Date + time variant, "5 Jul 2026 · 14:30" (Tashkent). Built from two calls so
// the "·" separator matches the original fmtStart the Mini App agrees with.
export function fmtDateTime(iso) {
  const date = fmtTashkent(iso, DATE_OPTS);
  if (!date) return "";
  const time = fmtTashkent(iso, TIME_OPTS);
  return time ? `${date} · ${time}` : date;
}

// Read the Tashkent Y/M/D/H/M of an absolute instant as zero-padded parts.
function tashkentParts(d) {
  const parts = {};
  const fmt = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  for (const { type, value } of fmt.formatToParts(d)) parts[type] = value;
  // Some engines emit "24" for midnight under hour12:false — normalize to "00".
  if (parts.hour === "24") parts.hour = "00";
  return parts;
}

// UTC instant → value for an <input type="datetime-local"> ("YYYY-MM-DDTHH:mm")
// showing the Tashkent WALL-CLOCK of that instant, regardless of browser tz.
// Returns "" for empty/invalid input.
export function toTashkentInput(iso) {
  const d = parseUTC(iso);
  if (!d) return "";
  const p = tashkentParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// INVERSE of toTashkentInput: interpret a datetime-local wall-clock as
// Asia/Tashkent (NOT the browser's zone) and return a UTC ISO string. Because
// Tashkent is a fixed +05:00 offset, the UTC instant is simply the typed clock
// time minus five hours. Returns null for empty/invalid input.
export function fromTashkentInput(localValue) {
  if (!localValue) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(localValue));
  if (!m) return null;
  const [, y, mo, da, h, mi, s] = m;
  const utcMs = Date.UTC(+y, +mo - 1, +da, +h, +mi, s ? +s : 0) - TASHKENT_OFFSET_MS;
  const d = new Date(utcMs);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
