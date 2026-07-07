"use client";

// The admin HUB sub-nav, shown on every /dashboard/* page. Five deep-linkable
// tabs — Overview (the read-only analytics), Users, Projects, Reports,
// Broadcast — highlighting the active one. Server pages pass `active` so the
// highlight is correct on first paint without waiting for JS.
//
// Broadcast is a super_admin-only action; the tab is still rendered for plain
// admins (so the console reads complete) but its page shows a "super-admins
// only" note. We don't hide it here to avoid needing `me` before first paint.

const TABS = [
  { key: "overview", href: "/dashboard", label: "Overview", icon: "▦" },
  { key: "users", href: "/dashboard/users", label: "Users", icon: "❋" },
  { key: "projects", href: "/dashboard/projects", label: "Projects", icon: "◆" },
  { key: "reports", href: "/dashboard/reports", label: "Reports", icon: "⚑" },
  { key: "broadcast", href: "/dashboard/broadcast", label: "Broadcast", icon: "📣" },
];

export default function AdminSubNav({ active }) {
  return (
    <nav
      aria-label="Admin console"
      style={{
        marginTop: 26,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        paddingBottom: 20,
        borderBottom: "1px solid var(--hair)",
      }}
    >
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <a
            key={t.key}
            href={t.href}
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
      })}
    </nav>
  );
}
