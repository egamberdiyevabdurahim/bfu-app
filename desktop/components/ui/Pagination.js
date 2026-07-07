"use client";

// Compact, self-contained paginator for the admin lists. Client-side only — the
// caller already holds the full array in state and slices the current page with
// the exported `paginate()` helper; this bar just drives the 1-based page index.
//
// Usage:
//   const [page, setPage] = useState(1);
//   const shown = paginate(list, page, PER_PAGE);
//   …render shown…
//   <Pagination page={page} pageSize={PER_PAGE} total={list.length} onPageChange={setPage} />
//
// Renders nothing when everything fits on one page (total <= pageSize).

/**
 * Return the `page`-th slice (1-based) of `list` at `pageSize` per page.
 * Keeps callers to a single expression; safe on non-arrays.
 */
export function paginate(list, page, pageSize) {
  if (!Array.isArray(list)) return [];
  const start = Math.max(0, (page - 1) * pageSize);
  return list.slice(start, start + pageSize);
}

// Build the condensed page set: always first + last, plus current±1, with gap
// markers where numbers are skipped (e.g. 1 … 4 5 6 … 20).
function pageItems(current, totalPages) {
  const wanted = new Set([1, totalPages, current, current - 1, current + 1]);
  const shown = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const items = [];
  let prev = 0;
  for (const p of shown) {
    if (prev && p - prev > 1) items.push({ gap: true, key: `gap-${prev}-${p}` });
    items.push({ page: p, key: `p-${p}` });
    prev = p;
  }
  return items;
}

export default function Pagination({ page, pageSize, total, onPageChange }) {
  if (!total || total <= pageSize) return null;

  const totalPages = Math.ceil(total / pageSize);
  const current = Math.min(Math.max(1, page), totalPages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const go = (p) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== current) onPageChange(next);
  };

  return (
    <nav
      aria-label="Pagination"
      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 22 }}
    >
      <button
        type="button"
        className="ch-btn-ghost"
        aria-label="Previous page"
        disabled={current === 1}
        onClick={() => go(current - 1)}
        style={{ padding: "7px 12px", fontSize: 12.5 }}
      >
        ← Prev
      </button>

      {pageItems(current, totalPages).map((it) =>
        it.gap ? (
          <span
            key={it.key}
            aria-hidden="true"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12, padding: "0 2px" }}
          >
            …
          </span>
        ) : (
          <button
            key={it.key}
            type="button"
            aria-label={`Page ${it.page}`}
            aria-current={it.page === current ? "page" : undefined}
            onClick={() => go(it.page)}
            style={{
              minWidth: 34,
              padding: "7px 10px",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              lineHeight: 1,
              borderRadius: 9,
              border: `1px solid ${it.page === current ? "var(--amber)" : "var(--hair)"}`,
              background: it.page === current ? "rgba(232,161,92,0.12)" : "transparent",
              color: it.page === current ? "var(--amber)" : "var(--muted-strong)",
            }}
          >
            {it.page}
          </button>
        )
      )}

      <button
        type="button"
        className="ch-btn-ghost"
        aria-label="Next page"
        disabled={current === totalPages}
        onClick={() => go(current + 1)}
        style={{ padding: "7px 12px", fontSize: 12.5 }}
      >
        Next →
      </button>

      <span
        style={{
          marginLeft: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--muted)",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        {from}–{to} of {total}
      </span>
    </nav>
  );
}
