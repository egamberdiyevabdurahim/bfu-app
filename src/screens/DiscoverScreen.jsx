import { useState, useEffect } from "react";
import { Page, AvatarEl } from "../components/Shared";
import { Icon } from "../components/Icons";
import { users } from "../api";
import { UserProfileModal } from "../components/UserProfileModal";

export const DiscoverScreen = () => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingUserId, setViewingUserId] = useState(null);

  const filters = ["All", "UI/UX", "Frontend", "Backend", "ML/AI", "Business"];

  useEffect(() => { loadUsers(); }, [activeFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const q = {};
      if (activeFilter !== "All") q.skill = activeFilter.toLowerCase();
      const res = await users.discover(q);
      setPeople(res);
    } catch (e) { }
    setLoading(false);
  };

  return (
    <>
      <Page>
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>DISCOVER</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>People</h1>
            </div>
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
                {f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "0 20px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}><Icon name="loader" size={24} /></div>
          ) : people.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>No users found</div>
          ) : people.map((p, i) => {
            const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
            return (
              <div key={p.id} className="card"
                onClick={() => setViewingUserId(p.id)}
                style={{ animation: `fadeUp ${0.1 + i * 0.08}s ease`, cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <AvatarEl name={[p.name, p.surname].filter(Boolean).join(" ") || p.display_name} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>
                        {[p.name, p.surname].filter(Boolean).join(" ") || p.display_name}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {p.open_to_work && <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>Startup</span>}
                        {p.open_to_volunteering && <span style={{ fontSize: 10, background: "rgba(78,205,196,0.15)", color: "#4ECDC4", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>Volunteer</span>}
                      </div>
                    </div>
                    {(age || p.gender) && (
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4, display: "flex", gap: 8 }}>
                        {age && <span>🎂 {age} y/o</span>}
                        {p.gender && <span>{p.gender === "Male" ? "♂" : "♀"} {p.gender}</span>}
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
