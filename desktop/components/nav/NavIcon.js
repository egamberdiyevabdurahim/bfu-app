// Crisp single-stroke line icons for the sidebar nav, keyed by navConfig `key`
// (plus a few chrome icons: plus, search, bell). Replaces the old abstract
// Unicode glyphs (✦ ◆ ◈ …) which read as "boring". Stroke is `currentColor`, so
// the active-row amber and hover states apply for free; sized via width/height.
//
// Style: 24×24 viewBox, 1.75 stroke, round caps/joins — the Linear/Notion look.

const PATHS = {
  // EXPLORE
  city: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4v18" />
      <path d="M19 21V11l-7-4" />
      <path d="M9 9h.01M9 12h.01M9 15h.01M9 18h.01" />
    </>
  ),
  projects: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 13 10 5 10-5" />
      <path d="m2 18 10 5 10-5" />
    </>
  ),
  mentors: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1.2 2.7 3 6 3s6-1.8 6-3v-5" />
      <path d="M22 10v6" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 9.5h18" />
    </>
  ),
  partners: (
    <>
      <path d="M11 17a3 3 0 0 0 3 3 3 3 0 0 0 3-3" />
      <path d="M7 8.5a3.5 3.5 0 0 1 5-3.16A3.5 3.5 0 0 1 17 8.5c0 2.5-2.5 4-5 6.5-2.5-2.5-5-4-5-6.5Z" />
      <path d="M12 5.34V15" />
    </>
  ),

  // YOU
  home: (
    <>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  "projects-mine": (
    <>
      <rect x="2.5" y="7" width="19" height="13.5" rx="2" />
      <path d="M15.5 20.5V5.5a2 2 0 0 0-2-2h-3a2 2 0 0 0-2 2v15" />
    </>
  ),
  requests: (
    <>
      <path d="M22 12h-5.5l-1.6 2.4a1 1 0 0 1-.8.6h-4.2a1 1 0 0 1-.8-.6L7.5 12H2" />
      <path d="M5.5 5.2 2.7 11.4a2 2 0 0 0-.2.8V19a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-6.8a2 2 0 0 0-.2-.8l-2.8-6.2a2 2 0 0 0-1.8-1.2H7.3a2 2 0 0 0-1.8 1.2Z" />
    </>
  ),
  messages: (
    <>
      <path d="M21 14.5a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
      <path d="M8 9h9M8 12.5h6" />
    </>
  ),
  favorites: (
    <path d="M19 21 12 16.2 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
  ),
  connections: (
    <>
      <path d="M16 21v-1.8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21" />
      <circle cx="9" cy="7.5" r="3.6" />
      <path d="M22 21v-1.8a4 4 0 0 0-3-3.86M16.5 4.14a4 4 0 0 1 0 7.72" />
    </>
  ),
  bookings: (
    <>
      <path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5.5" />
      <path d="M16 2.5v4M8 2.5v4M3 10h7" />
      <circle cx="17.5" cy="16.5" r="4.5" />
      <path d="M17.5 14.7v2l1.4 1.2" />
    </>
  ),
  notifications: (
    <>
      <path d="M6 8.5a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 14.5 6 8.5" />
      <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),

  // ADMIN
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.4" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.4" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.4" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.4" />
    </>
  ),

  // chrome
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7.2" />
      <path d="m21 21-4.9-4.9" />
    </>
  ),
};

export default function NavIcon({ name, size = 18, className, style }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}
