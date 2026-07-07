"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";

// Client-side "your network" list for /connections. Loads two authed endpoints
// on mount (per-user, uncacheable):
//   GET /users/me/connections → UserPublic[]  (mutual-interest peers)
//   GET /users/me/following   → { users:[{id,display_name,photo_url}],
//                                 projects:[{id,name,type}] }
// Rendered as two sections (Connections + Following) of Chorsu people cards
// linking to /u/{id}, with per-section empty states.

function PersonCard({ person }) {
  const name = person.display_name || person.name || "Builder";
  const seed = person.id != null ? person.id : name;
  const building = person.currently_building;
  return (
    <a
      href={`/u/${person.id}`}
      className="ch-card"
      style={{ animation: "none", opacity: 1, transform: "none", textDecoration: "none", padding: "22px 22px 20px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            flex: "0 0 auto",
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: gradientFor(seed),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 19,
            color: "#160E08",
            overflow: "hidden",
          }}
        >
          {person.photo_url ? (
            <img src={person.photo_url} alt={name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            initials(name)
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ch-card-nm" style={{ fontSize: 17 }}>
            {name}
            {person.checked && <span className="ch-card-vf">✓</span>}
          </div>
          {building ? (
            <div className="ch-card-bld" style={{ fontSize: 14, marginTop: 3 }}>
              building <b>{building}</b>
            </div>
          ) : (
            <div className="ch-card-reg" style={{ marginTop: 5 }}>
              View profile →
            </div>
          )}
        </div>
      </div>
    </a>
  );
}

function Section({ label, kicker, children }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="ch-slab">
        <span className="ch-slab-k">{kicker}</span>
        <h2>{label}</h2>
        <span className="ch-slab-line" />
      </div>
      {children}
    </div>
  );
}

function EmptySection({ title, body }) {
  return (
    <div className="ch-grace" style={{ minHeight: 150 }}>
      <span className="ch-grace-k">Nothing here yet</span>
      <div className="ch-grace-t">{title}</div>
      <div className="ch-grace-s">{body}</div>
    </div>
  );
}

export default function ConnectionsList() {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [connections, setConnections] = useState([]);
  const [following, setFollowing] = useState([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      bfu("/users/me/connections").catch(() => []),
      bfu("/users/me/following").catch(() => ({ users: [], projects: [] })),
    ])
      .then(([conns, follow]) => {
        if (!alive) return;
        setConnections(Array.isArray(conns) ? conns : []);
        setFollowing(Array.isArray(follow?.users) ? follow.users : []);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        Loading your network…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 28, color: "var(--terra)", fontSize: 14 }}>
        Couldn't load your network. Refresh to try again.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <Section label="Your connections" kicker="Mutual interest">
        {connections.length === 0 ? (
          <EmptySection
            title="No mutual connections yet."
            body="When you and another builder both express interest, they'll show up here. Wander the city and say hello."
          />
        ) : (
          <div className="ch-grid" style={{ marginTop: 18 }}>
            {connections.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </Section>

      <Section label="Following" kicker="People you follow">
        {following.length === 0 ? (
          <EmptySection
            title="You're not following anyone yet."
            body="Follow builders you admire and their work will surface for you. Open any profile and tap Follow."
          />
        ) : (
          <div className="ch-grid" style={{ marginTop: 18 }}>
            {following.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
