// Shared +998 phone masking (mirrors the server rule: +998 then exactly 9 digits).
//
// The UI shows a fixed, non-editable "+998" prefix and lets the user type only the
// remaining 9 local digits. We STORE the full E.164 value ("+998" + digits) so the
// value sent to the backend is canonical, and read the 9 local digits back out for
// display via phoneLocal().
export const PHONE_PREFIX = "+998";
export const PHONE_LOCAL_LEN = 9;

// Reduce any stored/typed/pasted value to its 9 LOCAL digits.
//   1. Strip our own canonical "+998" prefix FIRST — the stored value is always
//      "+998"+local (see toE164), so this is the round-trip that runs on every
//      keystroke. (Without it, storing "+9989" and reading it back showed "9989":
//      the "998" appeared to type itself.)
//   2. Then, from a PASTED full number (>9 digits) drop a bare 998 country code.
//   3. A bare 9-digit value is kept as-is — critical for real operator-99 locals
//      like "998234567" (Beeline), whose leading 998 is NOT a country code.
export const phoneLocal = (v) => {
  let s = String(v ?? "").trim();
  if (s.startsWith(PHONE_PREFIX)) s = s.slice(PHONE_PREFIX.length);
  s = s.replace(/\D/g, "");
  if (s.length > PHONE_LOCAL_LEN && s.startsWith("998")) s = s.slice(3);
  return s.slice(0, PHONE_LOCAL_LEN);
};

// True only when exactly 9 local digits are present.
export const phoneComplete = (v) => phoneLocal(v).length === PHONE_LOCAL_LEN;

// Canonical "+998XXXXXXXXX" from whatever the user typed/pasted. Empty string when
// there are no local digits at all (so a cleared field sends "" / null, not "+998").
export const toE164 = (raw) => {
  const d = phoneLocal(raw);
  return d ? PHONE_PREFIX + d : "";
};
