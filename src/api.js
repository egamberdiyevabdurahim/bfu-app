/**
 * BFU API Client — all backend endpoints, JWT auto-refresh, dev helpers.
 */

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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
  getProfile:      (id)     => req(`/users/${id}`),
  discover:        (p = {}) => req(`/users/discover${qs(p)}`),
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
  apply:             (id)     => req(`/projects/${id}/apply`, { method: "POST" }),
  cancelApply:       (id)     => req(`/projects/${id}/apply`, { method: "DELETE" }),
  reviewApplication: (id, appId, action) =>
    req(`/projects/${id}/applications/${appId}`, { method: "PATCH", body: JSON.stringify({ action }) }),
  leave:             (id)     => req(`/projects/${id}/join`, { method: "DELETE" }),
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
  getProjects:       (p = {}) => req(`/admin/projects${qs(p)}`),
  approveProject:    (id)     => req(`/admin/projects/${id}/approve`, { method: "PATCH" }),
  deleteProject:     (id)     => req(`/admin/projects/${id}`, { method: "DELETE" }),
  hardDeleteProject: (id)     => req(`/admin/projects/${id}/hard`, { method: "DELETE" }),
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
