// Static-asset URL helper.
//
// next.config.js sets `basePath: "/web"`. Next auto-prefixes routes, <Link> and
// router navigations with it — but NOT a plain <img src="/foo.png">. Without the
// prefix the browser requests https://brightfuturesuzbekistan.uz/foo.png, which is
// a DIFFERENT app (the Mini App SPA) that answers any unknown path with its
// index.html and a 200 → the <img> gets text/html and renders broken.
//
// So every plain image/asset src must go through asset(). Keep BASE_PATH in sync
// with next.config.js — it is the single place to change if basePath ever moves.
export const BASE_PATH = "/web";

/**
 * Prefix a public/ asset path with the app's basePath.
 * asset("/bfu-mark.png") -> "/web/bfu-mark.png"
 * Absolute URLs (http://, https://, data:, //) are returned untouched.
 */
export function asset(path) {
  if (!path) return path;
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path.startsWith("/") ? "" : "/"}${path}`;
}

export default asset;
