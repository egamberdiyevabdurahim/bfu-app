// Opaque public handles for profile URLs — the JS half of a codec shared with the
// backend (backend/app/core/handles.py). Profile links used to expose the raw
// sequential user id (/u/123); now they carry a short opaque code (/u/hqiAePi) so
// the id isn't enumerable or on display. The code is a keyed multiplicative
// permutation of the id in base62 — the frontend only ever ENCODES (building a
// link from an id it already holds); the backend decodes when resolving the URL.
//
// The three constants below MUST stay identical to handles.py (_MULT, _OFFSET,
// _SPACE / base62 alphabet), or the codes won't resolve. This is number
// obfuscation, not a secret. BigInt keeps the arithmetic exact regardless of id size.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 62
const BASE = 62n;
const LEN = 7;
const SPACE = BASE ** BigInt(LEN); // 62^7
const MULT = 2043747425n;
const OFFSET = 987654321987n;

/**
 * Opaque 7-char code for a numeric user id. Returns the id unchanged (as a string)
 * if it isn't a usable positive integer, so callers can always drop it into a URL.
 */
export function handleFor(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return String(id ?? "");
  let x = (BigInt(n) * MULT + OFFSET) % SPACE;
  let out = "";
  for (let i = 0; i < LEN; i++) {
    out = ALPHABET[Number(x % BASE)] + out;
    x /= BASE;
  }
  return out;
}

export default handleFor;
