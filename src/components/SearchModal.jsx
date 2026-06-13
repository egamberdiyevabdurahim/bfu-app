import { useState, useEffect, useRef } from "react";
import { Icon } from "./Icons";
import { AvatarEl } from "./Shared";
import { users } from "../api";
import { useT } from "../i18n";
import { UserProfileModal } from "./UserProfileModal";

export const SearchModal = ({ onClose }) => {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewingUserId, setViewingUserId] = useState(null);
  const seq = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setLoading(false); return; }
    setLoading(true);
    const my = ++seq.current;
    const id = setTimeout(async () => {
      try {
        const r = await users.search(term);
        if (seq.current === my) setRes(r);
      } catch { if (seq.current === my) setRes({ users: [], projects: [], events: [] }); }
      if (seq.current === my) setLoading(false);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const total = res ? (res.users.length + res.projects.length + res.events.length) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 16px 12px", display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99, padding: "8px 14px" }}>
          <Icon name="search" size={16} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder={t("search.placeholder")}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 15 }} />
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{t("common.cancel")}</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 40px" }}>
        {q.trim().length < 2 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>{t("search.hint")}</div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
        ) : total === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("search.empty")}</div>
        ) : (
          <>
            {res.users.length > 0 && (
              <Section title={t("search.people")}>
                {res.users.map(u => (
                  <Row key={`u${u.id}`} onClick={() => setViewingUserId(u.id)}>
                    <AvatarEl name={u.display_name} size={40} photoUrl={u.photo_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {u.display_name} {u.checked && <span style={{ color: "var(--accent)" }}>✓</span>}
                      </div>
                    </div>
                    <Icon name="chevron_right" size={16} />
                  </Row>
                ))}
              </Section>
            )}
            {res.projects.length > 0 && (
              <Section title={t("search.projects")}>
                {res.projects.map(p => (
                  <Row key={`p${p.id}`}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={p.type === "startup" ? "rocket" : "heart"} size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                      {p.goal && <div style={{ fontSize: 12, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.goal}</div>}
                    </div>
                  </Row>
                ))}
              </Section>
            )}
            {res.events.length > 0 && (
              <Section title={t("search.events")}>
                {res.events.map(e => (
                  <Row key={`e${e.id}`}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📅</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t(`events.type.${e.type}`) || e.type}</div>
                    </div>
                  </Row>
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {viewingUserId && <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />}
    </div>
  );
};

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, padding: "0 8px" }}>{title}</div>
    {children}
  </div>
);

const Row = ({ children, onClick }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 12, cursor: onClick ? "pointer" : "default" }}>
    {children}
  </div>
);
