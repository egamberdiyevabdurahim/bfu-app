// Opaque public handles for profile share-URLs — the Mini App half of a codec
// shared with the backend (backend/app/core/handles.py) and the desktop app
// (desktop/lib/handle.js). Share links used to expose the raw sequential user id
// (/u/123); now they carry a short opaque code (/u/hqiAePi) so the id isn't
// enumerable or on display. The frontend only ENCODES; the backend decodes when
// resolving the URL. The three constants below MUST stay identical across all
// three files. This is number obfuscation, not a secret. BigInt keeps it exact.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 62
const BASE = 62n;
const LEN = 7;
const SPACE = BASE ** BigInt(LEN); // 62^7
const MULT = 2043747425n;
const OFFSET = 987654321987n;

/** Opaque 7-char code for a numeric user id; returns the input unchanged if it
 *  isn't a positive integer, so it's always safe to drop into a URL. */
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
