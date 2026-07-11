"use client";

// The admin HUB sub-nav, shown on every /dashboard/* page. Deep-linkable tabs
// across two rows: the first is the moderation console (Overview, Users,
// Projects, Reports, Broadcast); the second is content management (Events,
// Partners, Places, System). Server pages pass `active` so the highlight is
// correct on first paint without waiting for JS.
//
// Broadcast + System exports are super_admin-only actions; those tabs are still
// rendered for plain admins (so the console reads complete) but their pages show
// a "super-admins only" note. We don't hide them here to avoid needing `me`
// before first paint.

// Row 1 — moderation console. Row 2 — content management (Batch 6b).
const TABS = [
  { key: "overview", href: "/dashboard", label: "Overview", icon: "▦", row: 0 },
  { key: "users", href: "/dashboard/users", label: "Users", icon: "❋", row: 0 },
  { key: "projects", href: "/dashboard/projects", label: "Projects", icon: "◆", row: 0 },
  { key: "reports", href: "/dashboard/reports", label: "Reports", icon: "⚑", row: 0 },
  { key: "broadcast", href: "/dashboard/broadcast", label: "Broadcast", icon: "📣", row: 0 },
  { key: "events", href: "/dashboard/events", label: "Events", icon: "📅", row: 1 },
  { key: "partners", href: "/dashboard/partners", label: "Partners", icon: "🤝", row: 1 },
  { key: "places", href: "/dashboard/places", label: "Places", icon: "◈", row: 1 },
  { key: "system", href: "/dashboard/system", label: "System", icon: "⚙", row: 1 },
];

function TabLink({ t, active }) {
  const on = active === t.key;
  return (
    <a
      href={`/web${t.href}`}
      aria-current={on ? "page" : undefined}
      className="ch-btn-ghost"
      style={
        on
          ? { borderColor: "var(--amber)", background: "rgba(35,32,25,0.9)", color: "var(--amber)" }
          : undefined
      }
    >
      <span style={{ fontSize: 13, color: "var(--amber)" }} aria-hidden>
        {t.icon}
      </span>
      {t.label}
    </a>
  );
}

export default function AdminSubNav({ active }) {
  const row0 = TABS.filter((t) => t.row === 0);
  const row1 = TABS.filter((t) => t.row === 1);
  return (
    <nav
      aria-label="Admin console"
      style={{
        marginTop: 26,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingBottom: 20,
        borderBottom: "1px solid var(--hair)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {row0.map((t) => (
          <TabLink key={t.key} t={t} active={active} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {row1.map((t) => (
          <TabLink key={t.key} t={t} active={active} />
        ))}
      </div>
    </nav>
  );
}
