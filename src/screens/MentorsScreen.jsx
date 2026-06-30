import { useState, useEffect } from "react";
import { mentors } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";
import { AvatarEl } from "../components/Shared";
import { UserProfileModal } from "../components/UserProfileModal";

export const MentorsScreen = ({ onClose }) => {
  const { t } = useT();
  const [list, setList] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  useEffect(() => {
    mentors.list().then(setList).catch(e => { tgAlert(e.message); setList([]); });
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 230, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(var(--safe-t) + 12px) 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("mentor.browse")}</h2>
        <button onClick={onClose} style={{ background: "var(--surface-2)", border: "none", borderRadius: 99, padding: "6px 14px", color: "var(--text-2)", fontSize: 13, cursor: "pointer" }}>{t("common.back")}</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 40px" }}>
        {list === null ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("mentor.noSlots")}</div>
        ) : list.map(m => (
          <div key={m.id} onClick={() => setViewingId(m.id)} style={{
            display: "flex", gap: 12, alignItems: "center", padding: "14px", marginBottom: 10,
            background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}>
            <AvatarEl name={m.display_name} size={48} photoUrl={m.photo_url} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{m.display_name}</div>
              {m.topics?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {m.topics.slice(0, 4).map(tp => (
                    <span key={tp} style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{tp}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{t("mentor.openSlots", { n: m.open_slots })}</div>
            </div>
          </div>
        ))}
      </div>
      {viewingId && <UserProfileModal userId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  );
};
