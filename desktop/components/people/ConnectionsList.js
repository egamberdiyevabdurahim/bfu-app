"use client";

import { useCallback, useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";

// Client-side "your network" list for /connections. Loads two authed endpoints
// on mount (per-user, uncacheable):
//   GET /users/me/connections → UserPublic[]  (mutual-interest peers)
//   GET /users/me/following   → { users:[{id,display_name,photo_url}],
//                                 projects:[{id,name,type}] }
// Rendered as two sections (Connections + Following) of Chorsu people cards
// linking to /u/{id}, with per-section empty + error states.

function PersonCard({ person, variant }) {
  const name = person.display_name || person.name || "Builder";
  const seed = person.id != null ? person.id : name;
  const building = person.currently_building;
  // The /me/following projection carries only id/name/photo, so a Following
  // card can't promise a build line or verified tick — render a quieter
  // "Following" variant instead of a broken/empty one.
  const following = variant === "following";
  return (
    <a
      href={`/u/${person.id}`}
      className="ch-card"
      style={{ textDecoration: "none", padding: "22px 22px 20px" }}
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
            <img
              src={person.photo_url}
              alt=""
              width={52}
              height={52}
              style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            initials(name)
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ch-card-nm" style={{ fontSize: 17 }}>
            {name}
            {person.checked && (
              <span className="ch-card-vf" role="img" aria-label="Verified">
                ✓
              </span>
            )}
          </div>
          {following ? (
            <div className="ch-card-reg" style={{ marginTop: 5, color: "var(--muted-strong)" }}>
              You follow them
            </div>
          ) : building ? (
            <div className="ch-card-bld" style={{ fontSize: 14, marginTop: 3 }}>
              building <b>{building}</b>
            </div>
          ) : (
            <div className="ch-card-reg" style={{ marginTop: 5, color: "var(--muted-strong)" }}>
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

function ErrorSection({ body, onRetry }) {
  return (
    <div className="ch-grace" style={{ minHeight: 150 }}>
      <span className="ch-grace-k" style={{ color: "var(--terra)" }}>
        Couldn't load
      </span>
      <div className="ch-grace-t">{body}</div>
      <button
        type="button"
        className="ch-btn-ghost"
        onClick={onRetry}
        style={{ marginTop: 14 }}
      >
        <span className="ch-spin" aria-hidden style={{ marginRight: 6 }}>
          ↻
        </span>
        Try again
      </button>
    </div>
  );
}

export default function ConnectionsList() {
  // Per-section status so a real failure on one endpoint shows a section-level
  // error (with retry) instead of masquerading as an empty "nobody here" state.
  const [state, setState] = useState("loading"); // loading | ready
  const [connections, setConnections] = useState({ status: "loading", items: [] });
  const [following, setFollowing] = useState({ status: "loading", items: [] });

  const loadConnections = useCallback(() => {
    setConnections((s) => ({ ...s, status: "loading" }));
    return bfu("/users/me/connections").then(
      (res) => setConnections({ status: "ready", items: Array.isArray(res) ? res : [] }),
      () => setConnections({ status: "error", items: [] })
    );
  }, []);

  const loadFollowing = useCallback(() => {
    setFollowing((s) => ({ ...s, status: "loading" }));
    return bfu("/users/me/following").then(
      (res) =>
        setFollowing({
          status: "ready",
          items: Array.isArray(res?.users) ? res.users : [],
        }),
      () => setFollowing({ status: "error", items: [] })
    );
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([loadConnections(), loadFollowing()]).finally(() => {
      if (alive) setState("ready");
    });
    return () => {
      alive = false;
    };
  }, [loadConnections, loadFollowing]);

  if (state === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }}
      >
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
          ◠
        </span>
        Loading your network…
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <Section label="Your connections" kicker="Mutual interest">
        {connections.status === "error" ? (
          <ErrorSection body="We couldn't reach your connections." onRetry={loadConnections} />
        ) : connections.items.length === 0 ? (
          <EmptySection
            title="No mutual connections yet."
            body="When you and another builder both express interest, they'll show up here. Wander the city and say hello."
          />
        ) : (
          <div className="ch-grid" style={{ marginTop: 18 }}>
            {connections.items.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </Section>

      <Section label="Following" kicker="People you follow">
        {following.status === "error" ? (
          <ErrorSection body="We couldn't reach the people you follow." onRetry={loadFollowing} />
        ) : following.items.length === 0 ? (
          <EmptySection
            title="You're not following anyone yet."
            body="Follow builders you admire and their work will surface for you. Open any profile and tap Follow."
          />
        ) : (
          <div className="ch-grid" style={{ marginTop: 18 }}>
            {following.items.map((p) => (
              <PersonCard key={p.id} person={p} variant="following" />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
