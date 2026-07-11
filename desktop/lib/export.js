// Client helper: download a super-admin JSON data export.
//
// The export endpoints (/admin/export/users.json, /admin/export/projects.json)
// return plain JSON and are super_admin-only server-side. Because they're JSON
// (not binary), they go through the same authed /api/bfu proxy every other admin
// call uses — the proxy attaches the httpOnly Bearer token server-side. We fetch
// as a blob and trigger a save via a temporary object URL so the file lands on
// disk as "bfu-<kind>.json" rather than rendering in a new tab.
//
//   await downloadExport("users");     // → bfu-users.json
//   await downloadExport("projects");  // → bfu-projects.json

const KINDS = {
  users: { path: "/admin/export/users.json", filename: "bfu-users.json" },
  projects: { path: "/admin/export/projects.json", filename: "bfu-projects.json" },
};

export async function downloadExport(kind) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Unknown export: ${kind}`);

  const res = await fetch(`/web/api/bfu${spec.path}`, { credentials: "include" });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = j.detail;
    } catch {
      // non-JSON error body — keep the status-based message
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = spec.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has committed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
