// Uzbek phone numbers: a FIXED +998 country prefix followed by EXACTLY 9 local
// digits. The UI shows "+998" as fixed chrome and the user types only the 9
// local digits. The server enforces the same rule (SHARED RULES), so these
// helpers keep the client in lock-step with it.

export const PHONE_PREFIX = "+998";
export const PHONE_LOCAL_LEN = 9;

// Reduce any stored/typed/pasted value to its 9 local digits: strip everything
// that isn't a digit, drop a leading 998 country code if a full number came in,
// then cap at 9.
export function toLocalPhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length > PHONE_LOCAL_LEN && d.startsWith("998")) d = d.slice(3);
  return d.slice(0, PHONE_LOCAL_LEN);
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
