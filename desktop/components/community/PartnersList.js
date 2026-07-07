"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";

// Partners directory (Batch 4). Loads GET /partners →
//   Partner[] { id, name, about, website, logo_url, region_id, verified }
// Each card links to the partner detail page /partners/{id}.

function Logo({ id, name, url, size = 48 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        flex: "0 0 auto",
        background: url ? "var(--surface-2)" : gradientFor(id),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: size * 0.34,
        color: "#160E08",
        overflow: "hidden",
      }}
    >
      {url ? (
        <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} />
      ) : (
        initials(name)
      )}
    </div>
  );
}

export default function PartnersList() {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [partners, setPartners] = useState([]);

  useEffect(() => {
    let alive = true;
    bfu("/partners")
      .then((res) => {
        if (!alive) return;
        setPartners(Array.isArray(res) ? res : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        Loading partners…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 28, color: "var(--terra)", fontSize: 14 }}>
        Couldn't load partners. Refresh to try again.
      </div>
    );
  }

  if (partners.length === 0) {
    return (
      <div className="ch-grace" style={{ marginTop: 24 }}>
        <span className="ch-grace-k">Building the network</span>
        <div className="ch-grace-t">No partner organisations yet.</div>
        <div className="ch-grace-s">
          Universities, incubators and companies that back young builders will
          appear here — with the opportunities they post.
        </div>
      </div>
    );
  }

  return (
    <div className="ch-grid" style={{ marginTop: 24, gridTemplateColumns: "repeat(3, 1fr)" }}>
      {partners.map((p) => (
        <a key={p.id} href={`/partners/${p.id}`} className="ch-cell" style={{ display: "block", padding: 22, color: "var(--text)", textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Logo id={p.id} name={p.name} url={p.logo_url} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em" }}>
                  {p.name}
                </span>
                {p.verified ? <span style={{ color: "var(--green)", fontSize: 12 }} title="Verified">✓</span> : null}
              </div>
              {p.website ? (
                <div style={{ marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.website.replace(/^https?:\/\//, "")}
                </div>
              ) : null}
            </div>
          </div>

          {p.about ? (
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--muted)",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {p.about}
            </p>
          ) : null}

          <div
            style={{
              marginTop: 16,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            View partner →
          </div>
        </a>
      ))}
    </div>
  );
}
