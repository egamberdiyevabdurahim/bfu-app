import { useState, useEffect, useRef } from "react";
import { Page, AvatarEl, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { users } from "../api";
import { UserProfileModal } from "../components/UserProfileModal";
import { useT } from "../i18n";

export const DiscoverScreen = () => {
  const { t } = useT();
  const [activeFilter, setActiveFilter] = useState("All");
  const [sort, setSort] = useState("recent");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewingUserId, setViewingUserId] = useState(null);
  const loadSeq = useRef(0);

  const filters = ["ForYou", "All", "UI/UX", "Frontend", "Backend", "ML/AI", "Business"];

  useEffect(() => { loadUsers(); }, [activeFilter, sort, verifiedOnly]);

  const loadUsers = async () => {
    const seq = ++loadSeq.current;
    setLoading(true); setLoadError(false);
    try {
      const q = { sort };
      if (verifiedOnly) q.verified = true;
      if (activeFilter === "ForYou") q.match = true;
      else if (activeFilter !== "All") q.skill = activeFilter.toLowerCase();
      const res = await users.discover(q);
      if (loadSeq.current !== seq) return;  // a newer filter/sort won the race
      setPeople(res);
    } catch (e) {
      // Don't masquerade a load failure as "no users" — show a retry instead.
      if (loadSeq.current === seq) setLoadError(true);
    }
    if (loadSeq.current === seq) setLoading(false);
  };

  return (
    <>
      <Page>
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>{t("discover.kicker")}</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>{t("discover.title")}</h1>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <select value={sort} onChange={e => setSort(e.target.value)} style={{
              flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: 13,
              color: "var(--text)", appearance: "none", cursor: "pointer",
            }}>
              <option value="recent">{t("sort.recent")}</option>
              <option value="verified">{t("sort.verified")}</option>
              <option value="name">{t("sort.name")}</option>
            </select>
            <button onClick={() => setVerifiedOnly(v => !v)} style={{
              padding: "8px 12px", fontSize: 12, fontWeight: 600,
              background: verifiedOnly ? "var(--accent)" : "var(--surface-2)",
              color: verifiedOnly ? "#fff" : "var(--text-2)",
              border: `1px solid ${verifiedOnly ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", cursor: "pointer", whiteSpace: "nowrap",
            }}>{t("filter.verifiedOnly")}</button>
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 20, scrollbarWidth: "none" }}>
            {filters.map(f => (
              <button key={f} onClick={() => setActiveFilter(f)} style={{
                flexShrink: 0, background: activeFilter === f ? "var(--accent)" : "var(--surface-2)",
                color: activeFilter === f ? "#fff" : "var(--text-2)",
                border: activeFilter === f ? "none" : "1px solid var(--border)",
                borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 500,
                cursor: "pointer", transition: "all 0.2s", fontFamily: "var(--font-display)",
              }}>
                {f === "All" ? t("filter.all") : f === "ForYou" ? `✨ ${t("discover.forYou")}` : f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "0 20px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <SkeletonList count={5} />
          ) : loadError ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>
              <div style={{ marginBottom: 12 }}>{t("common.loadError")}</div>
              <button onClick={loadUsers} style={{
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "8px 18px", color: "var(--text)",
                fontWeight: 600, cursor: "pointer",
              }}>{t("common.retry")}</button>
            </div>
          ) : people.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("discover.noUsers")}</div>
          ) : people.map((p, i) => {
            const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
            return (
              <div key={p.id} className="card"
                onClick={() => setViewingUserId(p.id)}
                style={{ animation: `fadeUp ${0.1 + i * 0.08}s ease`, cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <AvatarEl name={[p.name, p.surname].filter(Boolean).join(" ") || p.display_name} size={48} photoUrl={p.photo_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 5 }}>
                        {[p.name, p.surname].filter(Boolean).join(" ") || p.display_name}
                        {p.checked && <span title={t("common.verified")} style={{ color: "var(--accent)", fontSize: 13 }}>✓</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {p.open_to_work && <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>{t("discover.badge.startup")}</span>}
                        {p.open_to_volunteering && <span style={{ fontSize: 10, background: "rgba(78,205,196,0.15)", color: "#4ECDC4", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>{t("discover.badge.volunteer")}</span>}
                      </div>
                    </div>
                    {(age || p.gender) && (
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4, display: "flex", gap: 8 }}>
                        {age && <span>🎂 {t("common.yo", { n: age })}</span>}
                        {p.gender && <span>{p.gender === "Male" ? `♂ ${t("common.male")}` : `♀ ${t("common.female")}`}</span>}
                      </div>
                    )}
                    {p.about && <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 8 }}>{p.about.slice(0, 80)}{p.about.length > 80 ? "..." : ""}</div>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(p.analysis?.skills || []).slice(0, 4).map(s => <span key={s} className="tag">{s}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Page>

      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </>
  );
};
