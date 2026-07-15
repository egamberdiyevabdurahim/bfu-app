// Uzbek phone numbers: a FIXED +998 country prefix followed by EXACTLY 9 local
// digits. The UI shows "+998" as fixed chrome and the user types only the 9
// local digits. The server enforces the same rule (SHARED RULES), so these
// helpers keep the client in lock-step with it.

export const PHONE_PREFIX = "+998";
export const PHONE_LOCAL_LEN = 9;

// Reduce any stored/typed/pasted value to its 9 local digits.
//   1. Strip our own canonical "+998" prefix FIRST — the stored value is always
//      "+998"+local (see fullPhone), so this round-trip runs on every keystroke.
//      (Without it, "+9989" read back as "9989" — the "998" typed itself.)
//   2. From a PASTED full number (>9 digits), drop a bare 998 country code.
//   3. Keep a bare 9-digit value as-is — real operator-99 locals (e.g. 998234567)
//      legitimately start with 998 and must NOT lose it.
export function toLocalPhone(raw) {
  let s = String(raw ?? "").trim();
  if (s.startsWith(PHONE_PREFIX)) s = s.slice(PHONE_PREFIX.length);
  s = s.replace(/\D/g, "");
  if (s.length > PHONE_LOCAL_LEN && s.startsWith("998")) s = s.slice(3);
  return s.slice(0, PHONE_LOCAL_LEN);
}

// Compose the full +998######### value from any input. Empty string when there
// are no local digits at all (so a cleared field sends "" / null, not "+998").
export function fullPhone(raw) {
  const d = toLocalPhone(raw);
  return d ? PHONE_PREFIX + d : "";
}

// A complete Uzbek number = exactly 9 local digits.
export function isCompletePhone(raw) {
  return toLocalPhone(raw).length === PHONE_LOCAL_LEN;
}
