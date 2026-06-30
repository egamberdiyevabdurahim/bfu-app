/**
 * BFU API Client — all backend endpoints, JWT auto-refresh, dev helpers.
 */

// Use the configured API URL; "" means same-origin (the prod default, since
// Vercel rewrites proxy to the backend). Only fall back to localhost in dev —
// `??` alone would keep an empty-string prod value, but defaulting to
// localhost in a prod build would be worse, so treat "" as same-origin.
const _envBase = import.meta.env.VITE_API_URL;
const BASE = _envBase !== undefined
  ? _envBase
  : (import.meta.env.DEV ? "http://localhost:8000" : "");

// ── Token storage ─────────────────────────────────────────────────────────────
export const storage = {
  getAccess:  ()      => localStorage.getItem("bfu_access"),
  getRefresh: ()      => localStorage.getItem("bfu_refresh"),
  setTokens:  (a, r)  => { localStorage.setItem("bfu_access", a); localStorage.setItem("bfu_refresh", r); },
  clear:      ()      => { localStorage.removeItem("bfu_access"); localStorage.removeItem("bfu_refresh"); },
};

// ── Core fetch wrapper ────────────────────────────────────────────────────────
let _refreshing = null;

async function req(path, opts = {}, _retry = true) {
  const token = storage.getAccess();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && _retry) {
    if (!_refreshing) {
      _refreshing = _doRefresh().finally(() => { _refreshing = null; });
    }
    try {
      await _refreshing;
      return req(path, opts, false);
    } catch {
      storage.clear();
      window.dispatchEvent(new Event("bfu:signout"));
      throw new Error("Session expired");
    }
  }

  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
  return body;
}

async function _doRefresh() {
  const refresh_token = storage.getRefresh();
  if (!refresh_token) throw new Error("No refresh token");
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error("Refresh failed");
  storage.setTokens(data.access_token, data.refresh_token);
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const makeDevInitData = (userId) => {
  const user = JSON.stringify({
    id: userId, first_name: "Dev", last_name: "Admin",
    username: "devadmin", language_code: "en",
  });
  return new URLSearchParams({ user, auth_date: "0", hash: "devbypass" }).toString();
};

// ── Auth endpoints ────────────────────────────────────────────────────────────
export const auth = {
  telegram: (init_data) =>
    req("/auth/telegram", { method: "POST", body: JSON.stringify({ init_data }) }, false),
  refresh: _doRefresh,
};

// ── User endpoints ────────────────────────────────────────────────────────────
export const users = {
  me:              ()       => req("/users/me"),
  updateMe:        (data)   => req("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
  analyze:         ()       => req("/users/me/analyze", { method: "POST" }),
  fetchTgUsername: ()       => req("/users/me/fetch-tg-username", { method: "POST" }),
  checkGroups:     ()       => req("/users/me/groups"),
  finalize:        ()       => req("/users/me/finalize", { method: "POST" }),
  updateTags:      ()       => req("/users/me/update-tags", { method: "POST" }),
  invite:          ()       => req("/users/me/invite"),
  card:            ()       => req("/users/me/card"),
  setReferral:     (code)   => req("/users/me/referral", { method: "POST", body: JSON.stringify({ code }) }),
  leaderboard:     (period = "week") => req(`/users/leaderboard${qs({ period })}`),
  notifications:   ()       => req("/users/me/notifications"),
  unreadCount:     ()       => req("/users/me/notifications/unread-count"),
  markRead:        ()       => req("/users/me/notifications/read", { method: "POST" }),
  connections:     ()       => req("/users/me/connections"),
  coach:           (kind, text) => req("/users/me/coach", { method: "POST", body: JSON.stringify({ kind, text }) }),
  requestIntro:    (id)     => req(`/users/${id}/intro`, { method: "POST" }),
  interest:        (id)     => req(`/users/${id}/interest`, { method: "POST" }),
  translateBio:    (id, lang) => req(`/users/${id}/bio/translate${qs({ lang })}`),
  icebreakers:     (id, lang) => req(`/users/${id}/icebreakers${qs({ lang })}`),
  whyMatch:        (id, lang) => req(`/users/${id}/why-match${qs({ lang })}`),
  report:          (d)      => req("/users/reports", { method: "POST", body: JSON.stringify(d) }),
  getProfile:      (id)     => req(`/users/${id}`),
  discover:        (p = {}) => req(`/users/discover${qs(p)}`),
  search:          (q)      => req(`/search${qs({ q })}`),
  regionsPublic:   ()       => req("/public/regions"),
  endorse:         (id, skill) => req(`/users/${id}/endorse`, { method: "POST", body: JSON.stringify({ skill }) }),
  vouch:           (id, text)  => req(`/users/${id}/vouch`,   { method: "POST", body: JSON.stringify({ text }) }),
  deleteVouch:     (id)        => req(`/users/${id}/vouch`,   { method: "DELETE" }),
  publicUrl:       (id)        => `${window.location.origin}/u/${id}`,
  follow:        (target_type, target_id) => req("/follow", { method: "POST", body: JSON.stringify({ target_type, target_id }) }),
  unfollow:      (target_type, target_id) => req("/follow", { method: "DELETE", body: JSON.stringify({ target_type, target_id }) }),
  following:     ()       => req("/users/me/following"),
  achievements:  ()       => req("/users/me/achievements"),
};

// ── Project endpoints ─────────────────────────────────────────────────────────
export const projects = {
  list:              (p = {}) => req(`/projects${qs(p)}`),
  mine:              (p = {}) => req(`/projects/mine${qs(p)}`),
  myRequests:        (p = {}) => req(`/projects/my-requests${qs(p)}`),
  get:               (id)     => req(`/projects/${id}`),
  create:            (data)   => req("/projects", { method: "POST", body: JSON.stringify(data) }),
  update:            (id, d)  => req(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  delete:            (id)     => req(`/projects/${id}`, { method: "DELETE" }),
  apply:             (id, role) => req(`/projects/${id}/apply`, { method: "POST", body: JSON.stringify({ role: role || null }) }),
  cancelApply:       (id)     => req(`/projects/${id}/apply`, { method: "DELETE" }),
  reviewApplication: (id, appId, action) =>
    req(`/projects/${id}/applications/${appId}`, { method: "PATCH", body: JSON.stringify({ action }) }),
  leave:             (id)     => req(`/projects/${id}/join`, { method: "DELETE" }),
  favorite:          (id)     => req(`/projects/${id}/favorite`, { method: "POST" }),
  unfavorite:        (id)     => req(`/projects/${id}/favorite`, { method: "DELETE" }),
  favorites:         ()       => req("/projects/favorites"),
  stats:             (id)     => req(`/projects/${id}/stats`),
  rateable:          (id)            => req(`/projects/${id}/rateable`),
  rateMember:        (id, ratee_id, stars, note) =>
    req(`/projects/${id}/ratings`, { method: "POST", body: JSON.stringify({ ratee_id, stars, note }) }),
  postUpdate:        (id, text) => req(`/projects/${id}/updates`, { method: "POST", body: JSON.stringify({ text }) }),
  updates:           (id)       => req(`/projects/${id}/updates`),
  deleteUpdate:      (id, uid)  => req(`/projects/${id}/updates/${uid}`, { method: "DELETE" }),
  roles:             (id)       => req(`/projects/${id}/roles`),
  addRole:           (id, name) => req(`/projects/${id}/roles`, { method: "POST", body: JSON.stringify({ name }) }),
  setRoleFilled:     (id, rid, is_filled) => req(`/projects/${id}/roles/${rid}`, { method: "PATCH", body: JSON.stringify({ is_filled }) }),
  deleteRole:        (id, rid)  => req(`/projects/${id}/roles/${rid}`, { method: "DELETE" }),
};

// ── Open roles (discovery) ──────────────────────────────────────────────────
export const roles = {
  list: (q) => req(`/roles${qs({ q })}`),
};

// ── Mentors & bookings ──────────────────────────────────────────────────────
export const mentors = {
  list:        ()              => req("/mentors"),
  slots:       (id)            => req(`/mentors/${id}/slots`),
  createSlot:  (start_at)      => req("/mentors/me/slots", { method: "POST", body: JSON.stringify({ start_at }) }),
  deleteSlot:  (slotId)        => req(`/mentors/me/slots/${slotId}`, { method: "DELETE" }),
};

export const bookings = {
  book:    (slot_id, note)     => req("/bookings", { method: "POST", body: JSON.stringify({ slot_id, note: note || null }) }),
  act:     (id, action)        => req(`/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
  mine:    ()                  => req("/bookings/me"),
};

// ── Events ────────────────────────────────────────────────────────────────────
export const events = {
  list: (p = {}) => req(`/events${qs(p)}`),
  forMe: () => req("/events/for-me"),
};

export const partners = {
  list:    ()  => req("/partners"),
  mine:    ()  => req("/partners/mine"),
  profile: (id) => req(`/partners/${id}`),
  submit:  (d) => req("/partners/mine/opportunity", { method: "POST", body: JSON.stringify(d) }),
};

// ── Region endpoints ──────────────────────────────────────────────────────────
export const regions = {
  list:    ()   => req("/regions"),
  schools: (id) => req(`/regions/${id}/schools`),
  lcs:     (id) => req(`/regions/${id}/learning-centers`),
  listLCs: ()   => req("/regions/learning-centers"),
};

// ── Admin endpoints ───────────────────────────────────────────────────────────
export const admin = {
  getStats:          ()       => req("/admin/stats"),
  getUsers:          (p = {}) => req(`/admin/users${qs(p)}`),
  toggleCheck:       (id)     => req(`/admin/users/${id}/toggle-check`, { method: "PATCH" }),
  updateRole:        (id, r)  => req(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role: r }) }),
  deleteUser:        (id)     => req(`/admin/users/${id}`, { method: "DELETE" }),
  hardDeleteUser:    (id)     => req(`/admin/users/${id}/hard`, { method: "DELETE" }),
  denyUser:          (id, d)  => req(`/admin/users/${id}/deny`, { method: "POST", body: JSON.stringify(d) }),
  verifyUser:        (id)     => req(`/admin/users/${id}/verify`, { method: "POST" }),
  pinProject:        (id)     => req(`/admin/projects/${id}/pin`, { method: "PATCH" }),
  getErrors:         ()       => req("/admin/errors"),
  getAudit:          ()       => req("/admin/audit"),
  exportUsersUrl:    ()       => `${import.meta.env.VITE_API_URL ?? ""}/admin/export/users.json`,
  exportProjectsUrl: ()       => `${import.meta.env.VITE_API_URL ?? ""}/admin/export/projects.json`,
  getProjects:       (p = {}) => req(`/admin/projects${qs(p)}`),
  approveProject:    (id)     => req(`/admin/projects/${id}/approve`, { method: "PATCH" }),
  deleteProject:     (id)     => req(`/admin/projects/${id}`, { method: "DELETE" }),
  hardDeleteProject: (id)     => req(`/admin/projects/${id}/hard`, { method: "DELETE" }),
  myBotLocation:     ()       => req("/admin/my-bot-location"),
  getReports:        ()       => req("/admin/reports"),
  resolveReport:     (id)     => req(`/admin/reports/${id}/resolve`, { method: "PATCH" }),
  broadcast:         (d)      => req("/admin/broadcast", { method: "POST", body: JSON.stringify(d) }),
  getEvents:         ()       => req("/admin/events"),
  createEvent:       (d)      => req("/admin/events", { method: "POST", body: JSON.stringify(d) }),
  updateEvent:       (id, d)  => req(`/admin/events/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  approveEvent:      (id)     => req(`/admin/events/${id}/approve`, { method: "PATCH" }),
  deleteEvent:       (id)     => req(`/admin/events/${id}`, { method: "DELETE" }),
  getPartners:       ()       => req("/admin/partners"),
  createPartner:     (d)      => req("/admin/partners", { method: "POST", body: JSON.stringify(d) }),
  updatePartner:     (id, d)  => req(`/admin/partners/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deletePartner:     (id)     => req(`/admin/partners/${id}`, { method: "DELETE" }),
  getRegions:        ()       => req("/admin/regions"),
  getSchools:        ()       => req("/admin/schools"),
  createSchool:      (d)      => req("/admin/schools", { method: "POST", body: JSON.stringify(d) }),
  updateSchool:      (id, d)  => req(`/admin/schools/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteSchool:      (id)     => req(`/admin/schools/${id}`, { method: "DELETE" }),
  getLCs:            ()       => req("/admin/learning-centers"),
  createLC:          (d)      => req("/admin/learning-centers", { method: "POST", body: JSON.stringify(d) }),
  updateLC:          (id, d)  => req(`/admin/learning-centers/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  deleteLC:          (id)     => req(`/admin/learning-centers/${id}`, { method: "DELETE" }),
};

// ── Health ────────────────────────────────────────────────────────────────────
export const health = () => req("/health", {}, false);
