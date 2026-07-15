// Shared +998 phone masking (mirrors the server rule: +998 then exactly 9 digits).
//
// The UI shows a fixed, non-editable "+998" prefix and lets the user type only the
// remaining 9 local digits. We STORE the full E.164 value ("+998" + digits) so the
// value sent to the backend is canonical, and read the 9 local digits back out for
// display via phoneLocal().
export const PHONE_PREFIX = "+998";
export const PHONE_LOCAL_LEN = 9;

// Reduce any stored/typed/pasted value to its 9 LOCAL digits. Strip everything
// that isn't a digit, then drop a leading "998" country code ONLY when the input
// is longer than 9 digits (i.e. a full number was pasted). A bare 9-digit value is
// kept as-is — critical for real operator-99 locals like "998234567" (Beeline),
// whose leading 998 must NOT be mistaken for the country code. (Matches
// desktop/lib/phone.js toLocalPhone exactly so both apps agree.)
export const phoneLocal = (v) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length > PHONE_LOCAL_LEN && d.startsWith("998")) d = d.slice(3);
  return d.slice(0, PHONE_LOCAL_LEN);
};

// True only when exactly 9 local digits are present.
export const phoneComplete = (v) => phoneLocal(v).length === PHONE_LOCAL_LEN;

// Canonical "+998XXXXXXXXX" from whatever the user typed/pasted. Empty string when
// there are no local digits at all (so a cleared field sends "" / null, not "+998").
export const toE164 = (raw) => {
  const d = phoneLocal(raw);
  return d ? PHONE_PREFIX + d : "";
};
