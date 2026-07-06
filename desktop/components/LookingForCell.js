const LABELS = {
  work: "Open to co-founder / team opportunities",
  volunteering: "Open to volunteering",
  both: "Open to co-founder opportunities and volunteering",
};

export default function LookingForCell({ lookingFor }) {
  if (!lookingFor) return null;

  return (
    <div className="ch-cell" style={{ gridColumn: "span 2",
      borderColor: "rgba(127,176,105,0.3)",
      background: "linear-gradient(150deg, rgba(127,176,105,0.10), var(--surface) 60%)",
      display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)",
          boxShadow: "0 0 12px rgba(127,176,105,0.8)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--green)" }}>Looking for</span>
      </div>
      <p style={{ margin: "16px 0 0", fontSize: 20, lineHeight: 1.4, color: "var(--text)",
        fontFamily: "var(--font-display)", fontWeight: 500 }}>
        {LABELS[lookingFor]}
      </p>
    </div>
  );
}
