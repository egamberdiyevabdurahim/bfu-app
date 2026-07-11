"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";

// Partners directory (Batch 4). Loads GET /partners →
//   Partner[] { id, name, about, website, logo_url, region_id, verified }
// Each card links to the partner detail page /partners/{id}.

function Logo({ id, name, url, size = 48 }) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  const showImg = url && !broken;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        flex: "0 0 auto",
        background: showImg ? "var(--surface-2)" : gradientFor(id),
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
      {showImg ? (
        <img
          src={url}
          alt={t("community.partners.logoAlt", { name })}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

export default function PartnersList() {
  const t = useT();
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
      <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }} role="status" aria-live="polite">
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("community.partners.loading")}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }} role="status" aria-live="polite">
        <span style={{ color: "var(--terra)", fontSize: 14 }}>{t("community.partners.loadError")}</span>
        <button type="button" onClick={() => window.location.reload()} className="ch-btn-ghost">
          {t("community.tryAgain")}
        </button>
      </div>
    );
  }

  if (partners.length === 0) {
    return (
      <div className="ch-grace" style={{ marginTop: 24 }}>
        <span className="ch-grace-k">{t("community.partners.emptyKicker")}</span>
        <div className="ch-grace-t">{t("community.partners.emptyTitle")}</div>
        <div className="ch-grace-s">
          {t("community.partners.emptyBody")}
        </div>
      </div>
    );
  }

  return (
    <div className="ch-grid" style={{ marginTop: 24 }}>
      {partners.map((p) => (
        <a key={p.id} href={`/web/partners/${p.id}`} className="ch-cell" style={{ display: "block", padding: 28, color: "var(--text)", textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Logo id={p.id} name={p.name} url={p.logo_url} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em" }}>
                  {p.name}
                </span>
                {p.verified ? (
                  <span role="img" aria-label={t("community.partners.verified")} style={{ color: "var(--green)", fontSize: 12 }}>✓</span>
                ) : null}
              </div>
              {p.website ? (
                <div style={{ marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
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
            {t("community.partners.viewPartner")}
          </div>
        </a>
      ))}
    </div>
  );
}
