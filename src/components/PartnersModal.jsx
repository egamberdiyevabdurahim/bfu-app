import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { partners } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

const OPP_TYPES = ["hackathon", "grant", "scholarship", "meetup", "other"];

export const PartnersModal = ({ onClose }) => {
  const { t } = useT();
  const [list, setList] = useState(null);
  const [mine, setMine] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    partners.list().then(r => setList(Array.isArray(r) ? r : [])).catch(() => setList([]));
    partners.mine().then(r => setMine(r?.partner || null)).catch(() => {});
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 20px 12px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)" }}>
        <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
          <Icon name="x" size={16} />
        </button>
        <div>
          <p style={{ color: "var(--text-3)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", fontFamily: "var(--font-display)" }}>{t("partners.kicker")}</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("partners.title")}</h1>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 40px" }}>
        {mine && (
          <PostOpportunity mine={mine} posting={posting} setPosting={setPosting} t={t} />
        )}

        {list === null ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("partners.empty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map(p => (
              <div key={p.id} onClick={() => setOpenId(p.id)} className="card" style={{ cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
                <Logo p={p} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 5 }}>
                    {p.name} {p.verified && <span title={t("partners.verified")} style={{ color: "var(--accent)", fontSize: 12 }}>✓</span>}
                  </div>
                  {p.about && <div style={{ fontSize: 12, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.about}</div>}
                </div>
                <Icon name="chevron_right" size={16} />
              </div>
            ))}
          </div>
        )}
      </div>

      {openId && <PartnerProfile id={openId} onBack={() => setOpenId(null)} t={t} />}
    </div>
  );
};

const Logo = ({ p, size = 46 }) => {
  const [failed, setFailed] = useState(false);
  if (p.logo_url && !failed) {
    return <img src={p.logo_url} alt="" onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: 10, background: "var(--accent-dim)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontFamily: "var(--font-display)", flexShrink: 0 }}>{(p.name || "?")[0].toUpperCase()}</div>;
};

const PostOpportunity = ({ mine, posting, setPosting, t }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "grant", title: "", description: "", link: "", deadline: "" });
  const submit = async () => {
    if (!form.title.trim()) return;
    setPosting(true);
    try {
      await partners.submit({
        type: form.type, title: form.title.trim(),
        description: form.description || null, link: form.link || null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      });
      tgAlert(t("partners.submitted"));
      setForm({ type: "grant", title: "", description: "", link: "", deadline: "" });
      setOpen(false);
    } catch (e) { tgAlert(e.message); }
    setPosting(false);
  };
  return (
    <div style={{ background: "linear-gradient(135deg, var(--accent-dim), var(--surface-2))", border: "1px solid var(--accent)", borderRadius: 14, padding: 14, marginBottom: 14 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15 }}>🏛 {mine.name}</div>
      <div style={{ fontSize: 12, color: "var(--text-2)", margin: "4px 0 10px" }}>{t("partners.youManage")}</div>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ width: "100%", padding: 11, background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-display)" }}>{t("partners.postBtn")}</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <select className="input-field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {OPP_TYPES.map(ty => <option key={ty} value={ty}>{t(`events.type.${ty}`)}</option>)}
          </select>
          <input className="input-field" placeholder={t("partners.titlePh")} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <textarea className="input-field" rows={3} placeholder={t("partners.descPh")} style={{ resize: "none" }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <input className="input-field" placeholder={t("partners.linkPh")} value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} />
          <input className="input-field" type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setOpen(false)} style={{ flex: 1, padding: 10, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontWeight: 600, cursor: "pointer" }}>{t("common.cancel")}</button>
            <button onClick={submit} disabled={posting || !form.title.trim()} style={{ flex: 1, padding: 10, background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: posting || !form.title.trim() ? 0.6 : 1 }}>{posting ? "…" : t("partners.send")}</button>
          </div>
        </div>
      )}
    </div>
  );
};

const PartnerProfile = ({ id, onBack, t }) => {
  const [p, setP] = useState(null);
  useEffect(() => { partners.profile(id).then(setP).catch(() => onBack()); }, [id]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 260, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 20px 12px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)" }}>
        <button onClick={onBack} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
          <Icon name="arrow_left" size={16} />
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800 }}>{p?.name || "…"}</h1>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {!p ? <div style={{ color: "var(--text-3)" }}>{t("common.loading")}</div> : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
              <Logo p={p} size={64} />
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, display: "flex", alignItems: "center", gap: 6 }}>
                  {p.name} {p.verified && <span style={{ color: "var(--accent)", fontSize: 14 }}>✓</span>}
                </div>
                {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>{p.website.replace(/^https?:\/\//, "")}</a>}
              </div>
            </div>
            {p.about && <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 18 }}>{p.about}</p>}
            <div className="section-label">{t("partners.opportunities")}</div>
            {(!p.events || p.events.length === 0) ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, padding: "10px 0" }}>{t("partners.noOpps")}</div>
            ) : p.events.map(e => (
              <div key={e.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{t(`events.type.${e.type}`) || e.type}</span>
                  {e.deadline && <span style={{ fontSize: 11, color: "#FFB347", fontWeight: 600 }}>{new Date(e.deadline).toLocaleDateString()}</span>}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{e.title}</div>
                {e.description && <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, marginTop: 4 }}>{e.description}</p>}
                {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{t("events.open")}</a>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
