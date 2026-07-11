"use client";

import Link from "next/link";
import { gradientFor, initials } from "@/lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";

// Team cell — the FULL project roster on `/p/[id]`: the founder first (marked
// "Founder"), then each teammate as a row (avatar + online dot + name linking to
// their /u/[id] profile + their member-role as a subtle pill). SERVER component;
// renders from the page payload (`team` now carries `role` + `is_online`, and
// the founder rides in via `founder` + `founderRole`). Stays graceful when it's
// just the founder. Keeps the firelit `.ch-cell-static` styling.
//
// The member-role shown here is a title on an actual teammate — distinct from
// the OPEN roles the project is hiring for (see OpenRolesCell).

function MemberRow({ id, name, photo, online, checked, role, isFounder }) {
  const t = useT();
  const label = name || t("messages.team_member_fallback");
  return (
    <Link
      href={`/web/u/${id}`}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 4px",
        borderRadius: "var(--radius-sm)",
        textDecoration: "none",
      }}
    >
      {/* Avatar + presence dot */}
      <div
        style={{
          position: "relative",
          width: 40,
          height: 40,
          flex: "0 0 auto",
          borderRadius: "50%",
          background: gradientFor(id),
          border: "2px solid var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 14,
          color: "#160E08",
          overflow: "hidden",
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={label}
            style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          initials(label)
        )}
        {online && (
          <span
            aria-label={t("messages.online_now")}
            style={{
              position: "absolute",
              bottom: -1,
              right: -1,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "var(--green)",
              border: "2px solid var(--surface)",
            }}
          />
        )}
      </div>

      {/* Name (+ verified check) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15.5,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
          {checked && (
            <span
              role="img"
              aria-label={t("messages.verified")}
              style={{
                flex: "0 0 auto",
                width: 15,
                height: 15,
                borderRadius: "50%",
                background: "var(--green)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: "#160E08",
                fontWeight: 900,
              }}
            >
              ✓
            </span>
          )}
        </div>
      </div>

      {/* Role / Founder pill */}
      {isFounder ? (
        <span
          style={{
            flex: "0 0 auto",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--amber)",
            background: "rgba(232,161,92,0.12)",
            border: "1px solid rgba(232,161,92,0.3)",
            borderRadius: "var(--radius-pill)",
            padding: "4px 10px",
          }}
        >
          {t("messages.founder")}{role ? ` · ${role}` : ""}
        </span>
      ) : role ? (
        <span
          style={{
            flex: "0 0 auto",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted-strong)",
            background: "var(--surface-2)",
            border: "1px solid var(--hair)",
            borderRadius: "var(--radius-pill)",
            padding: "4px 10px",
          }}
        >
          {role}
        </span>
      ) : null}
    </Link>
  );
}

export default function TeamCell({ team, teamCount, founder, founderRole }) {
  const t = useT();
  const members = Array.isArray(team) ? team : [];
  const count = typeof teamCount === "number" ? teamCount : members.length;
  const soloFounder = count === 0;
  const total = count + (founder ? 1 : 0);

  return (
    <div
      className="ch-cell-static"
      style={{ gridColumn: "span 2", display: "flex", flexDirection: "column" }}
    >
      <div className="ch-cell-label">{t("messages.team")}</div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
        {founder ? (
          <MemberRow
            id={founder.id}
            name={founder.display_name || founder.name}
            photo={founder.photo_url}
            online={founder.is_online}
            checked={founder.checked}
            role={founderRole}
            isFounder
          />
        ) : null}
        {members.map((m) => (
          <MemberRow
            key={m.id}
            id={m.id}
            name={m.display_name}
            photo={m.photo_url}
            online={m.is_online}
            checked={m.checked}
            role={m.role}
          />
        ))}
      </div>

      {soloFounder ? (
        <p
          style={{
            margin: "12px 4px 0",
            fontSize: 13.5,
            color: "var(--muted-strong)",
            lineHeight: 1.5,
          }}
        >
          {t("messages.solo_founder")}
        </p>
      ) : (
        <div style={{ marginTop: 14, padding: "0 4px", fontSize: 14, color: "var(--text)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{total}</span>{" "}
          {t("messages.building_together")}
        </div>
      )}
    </div>
  );
}
