/** @type {import('next').NextConfig} */
// Served under brightfuturesuzbekistan.uz/web (path-hosted, not a subdomain).
// basePath makes Next emit every route, asset, <Link> and redirect() under /web.
// Plain <a href> and fetch() are NOT auto-prefixed by Next — those are prefixed
// explicitly at their call sites.
const nextConfig = {
  basePath: "/web",
};

module.exports = nextConfig;
