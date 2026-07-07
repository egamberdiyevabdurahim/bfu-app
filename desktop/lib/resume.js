// Client helper: download the logged-in member's one-page PDF CV.
//
// The bytes come from the same-origin, authed server route /api/resume (which
// attaches the Bearer token server-side and streams the raw PDF — see
// app/api/resume/route.js). We fetch as a blob, then trigger a save via a
// temporary object URL so the file lands as "BFU-CV.pdf" rather than opening
// a new tab.

export async function downloadResume() {
  const res = await fetch("/api/resume", { credentials: "include" });
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

  // Prefer the server-provided filename when present.
  let filename = "BFU-CV.pdf";
  const disp = res.headers.get("content-disposition") || "";
  const m = /filename="?([^"]+)"?/.exec(disp);
  if (m && m[1]) filename = m[1];

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has committed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
