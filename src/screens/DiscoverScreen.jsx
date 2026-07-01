import { useState, useEffect, useRef } from "react";
import { Page, AvatarEl, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { users } from "../api";
import { UserProfileModal } from "../components/UserProfileModal";
import { InboxModal } from "../components/InboxModal";
import { SearchModal } from "../components/SearchModal";
import { MapModal } from "../components/MapModal";
import { OpenRolesScreen } from "./OpenRolesScreen";
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
  const [inboxOpen, setInboxOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const loadSeq = useRef(0);

  const filters = ["ForYou", "All", "UI/UX", "Frontend", "Backend", "ML/AI", "Business"];

  useEffect(() => { loadUsers(); }, [activeFilter, sort, verifiedOnly]);

  // Unread badge: load once + poll every 60s (cheap count endpoint).
  useEffect(() => {
    const tick = () => users.unreadCount().then(r => setUnread(r?.unread || 0)).catch(() => {});
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

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
        <div style={{ padding: "calc(var(--safe-t) + 16px) 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>{t("discover.kicker")}</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>{t("discover.title")}</h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["search", () => setSearchOpen(true)], ["map", () => setMapOpen(true)], ["briefcase", () => setRolesOpen(true)]].map(([icon, onClick]) => (
                <button key={icon} onClick={onClick} aria-label={icon === "briefcase" ? t("roles.title") : icon} title={icon === "briefcase" ? t("roles.title") : undefined} style={{
                  background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99,
                  width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "var(--text)", flexShrink: 0,
                }}><Icon name={icon} size={18} /></button>
              ))}
              <button onClick={() => { setInboxOpen(true); setUnread(0); }} aria-label={t("inbox.title")} style={{
                position: "relative", background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: 99, width: 40, height: 40, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", color: "var(--text)", flexShrink: 0,
              }}>
                <Icon name="bell" size={18} />
                {unread > 0 && (
                  <span style={{
                    position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px",
                    background: "#FF6B6B", color: "#fff", borderRadius: 99, fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--bg)",
                  }}>{unread > 9 ? "9+" : unread}</span>
                )}
              </button>
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
                        {p.match_pct != null && <span style={{ fontSize: 10, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#fff", borderRadius: 99, padding: "2px 8px", fontWeight: 700 }}>{t("discover.matchPct", { n: p.match_pct })}</span>}
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
      {inboxOpen && <InboxModal onClose={() => setInboxOpen(false)} />}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {mapOpen && <MapModal onClose={() => setMapOpen(false)} />}
      {rolesOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg)" }}>
          <OpenRolesScreen onBack={() => setRolesOpen(false)} />
        </div>
      )}
    </>
  );
};
