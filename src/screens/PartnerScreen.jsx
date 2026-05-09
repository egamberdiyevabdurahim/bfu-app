import { useState, useEffect } from "react";
import { Page, AvatarEl } from "../components/Shared";
import { Icon } from "../components/Icons";
import { users } from "../api";

export const PartnerScreen = () => {
  const [step, setStep] = useState("intro"); // intro | fill | results
  const [answers, setAnswers] = useState({ idea: "", skills: [], role: "" });
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);

  const skillOptions = ["UI/UX", "Frontend", "Backend", "ML/AI", "Business", "Design", "Marketing", "Mobile"];

  const handleMatch = async () => {
    setLoading(true);
    try {
      const res = await users.discover({ open_to_work: true });
      setMatches(res);
      setStep("results");
    } catch (e) {
      alert("Error finding matches: " + e.message);
    }
    setLoading(false);
  };

  if (step === "results") return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <button onClick={() => setStep("intro")} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          <Icon name="arrow_left" size={18} /> Back
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Your Matches</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 20 }}>People who are open to co-founding</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {matches.length === 0 ? (
             <div style={{textAlign: "center", padding: 40, color: "var(--text-3)"}}>No partners found.</div>
          ) : matches.map((p, i) => (
            <div key={p.id} className="card" style={{ animation: `slideInRight ${0.1 + i * 0.1}s ease` }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <AvatarEl name={p.display_name} size={52} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{p.display_name}</div>
                  </div>
                  <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 8 }}>{p.about}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(p.analysis?.skills || []).slice(0, 2).map(s => <span key={s} className="tag">{s}</span>)}
                  </div>
                </div>
              </div>
              <button style={{
                width: "100%", marginTop: 12,
                background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
                color: "#fff", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                padding: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <Icon name="mail" size={14} /> Send Intro
              </button>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );

  if (step === "fill") return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <button onClick={() => setStep("intro")} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <Icon name="arrow_left" size={18} /> Back
        </button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Find a Partner</h2>
        <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 24 }}>Tell us about what you're building</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div className="section-label">Your Idea</div>
            <textarea className="input-field" rows={3} placeholder="Describe what you're building in a sentence or two..." style={{ resize: "none" }}
              value={answers.idea} onChange={e => setAnswers(a => ({ ...a, idea: e.target.value }))} />
          </div>
          <div>
            <div className="section-label">Skills you need</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {skillOptions.map(s => (
                <button key={s} onClick={() => setAnswers(a => ({
                  ...a, skills: a.skills.includes(s) ? a.skills.filter(x => x !== s) : [...a.skills, s]
                }))} className={`chip ${answers.skills.includes(s) ? "active" : ""}`} style={{ cursor: "pointer", padding: "8px 14px", fontSize: 13 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={handleMatch} disabled={loading}>
            {loading ? "Matching..." : "Find Matches"}
          </button>
        </div>
      </div>
    </Page>
  );

  return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>CO-FOUNDER</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Find a Partner</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 24 }}>Connect with peers looking for a co-founder.</p>

        <div style={{
          background: "linear-gradient(135deg, rgba(123,111,255,0.2), rgba(78,205,196,0.15))",
          border: "1px solid rgba(123,111,255,0.3)", borderRadius: "var(--radius)",
          padding: "24px 20px", marginBottom: 20, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, background: "radial-gradient(circle, rgba(123,111,255,0.3), transparent)", borderRadius: "50%" }} />
          <Icon name="handshake" size={28} color="var(--accent)" />
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, marginTop: 10, marginBottom: 6 }}>
            Build together.
          </h2>
          <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Browse through BFU users who are open to co-founding and looking for new opportunities.
          </p>
          <button className="btn-primary" onClick={() => setStep("fill")} style={{ width: "auto", padding: "11px 24px" }}>
            Start Matching →
          </button>
        </div>
      </div>
    </Page>
  );
};
