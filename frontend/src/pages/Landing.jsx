import { useNavigate } from "react-router-dom";

const S = {
  page: {
    minHeight: "100vh",
    background: "#0b0d10",
    color: "#e6e9ef",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    letterSpacing: "-0.005em",
    WebkitFontSmoothing: "antialiased",
  },
  brand: {
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 64,
  },
  brandMark: {
    width: 28, height: 28, borderRadius: 8,
    background: "linear-gradient(135deg, #e6e9ef 0%, #8b95a7 100%)",
    display: "grid", placeItems: "center",
    position: "relative",
  },
  brandName: {
    fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em",
  },
  hero: {
    textAlign: "center", maxWidth: 560, marginBottom: 52,
  },
  eyebrow: {
    fontSize: 11.5,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#6b7482",
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    marginBottom: 20,
  },
  h1: {
    fontSize: 42, fontWeight: 700, letterSpacing: "-0.025em",
    lineHeight: 1.1, margin: "0 0 20px", color: "#e6e9ef",
  },
  sub: {
    fontSize: 16, color: "#a7b0bd", lineHeight: 1.6, margin: 0,
  },
  btnGroup: {
    display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320,
  },
  btnPrimary: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#e6e9ef", color: "#0b0d10",
    fontSize: 13.5, fontWeight: 600,
    padding: "13px 18px", borderRadius: 8,
    border: "none", cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "-0.005em",
    transition: "background 80ms",
  },
  btnSecondary: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "transparent", color: "#a7b0bd",
    fontSize: 13.5, fontWeight: 500,
    padding: "13px 18px", borderRadius: 8,
    border: "1px solid #1f242c", cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "-0.005em",
    transition: "background 80ms, border-color 80ms, color 80ms",
  },
  btnLabel: { display: "flex", alignItems: "center", gap: 9 },
  chip: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    padding: "2px 7px", borderRadius: 4, fontWeight: 600,
    letterSpacing: "0.07em", textTransform: "uppercase",
  },
  chipRm: {
    background: "#14181d", color: "#6b7482", border: "1px solid #1f242c",
  },
  chipRisk: {
    background: "#3a2a10", color: "#ffc772", border: "1px solid #5a3f17",
  },
  arrow: { opacity: 0.4, fontSize: 16, lineHeight: 1 },
  footer: {
    marginTop: 72,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11.5, color: "#4a525e",
    display: "flex", gap: 24, alignItems: "center",
  },
  footDot: { width: 3, height: 3, borderRadius: "50%", background: "#2a313b" },
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={S.page}>
      {/* Brand */}
      <div style={S.brand}>
        <div style={S.brandMark}>
          <div style={{
            width: 10, height: 10, borderRadius: 2,
            background: "#0b0d10", transform: "rotate(45deg)",
          }} />
        </div>
        <span style={S.brandName}>Signal</span>
      </div>

      {/* Hero */}
      <div style={S.hero}>
        <p style={S.eyebrow}>Commercial banking intelligence</p>
        <h1 style={S.h1}>Know which clients need&nbsp;you today.</h1>
        <p style={S.sub}>
          Signal runs overnight across your portfolio, surfaces credit stress,
          churn risk, and upsell opportunities — and hands you a prioritised
          action queue every morning.
        </p>
      </div>

      {/* CTAs */}
      <div style={S.btnGroup}>
        <button
          style={S.btnPrimary}
          onClick={() => navigate("/login?role=rm")}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#e6e9ef"; }}
        >
          <span style={S.btnLabel}>
            <span style={{ ...S.chip, ...S.chipRm }}>RM</span>
            Relationship Manager Login
          </span>
          <span style={S.arrow}>→</span>
        </button>

        <button
          style={S.btnSecondary}
          onClick={() => navigate("/login?role=risk")}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#0f1216";
            e.currentTarget.style.borderColor = "#2a313b";
            e.currentTarget.style.color = "#e6e9ef";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "#1f242c";
            e.currentTarget.style.color = "#a7b0bd";
          }}
        >
          <span style={S.btnLabel}>
            <span style={{ ...S.chip, ...S.chipRisk }}>Risk</span>
            Risk Manager Login
          </span>
          <span style={S.arrow}>→</span>
        </button>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <span>Pipeline · daily 06:30 UTC</span>
        <span style={S.footDot} />
        <span>47 accounts monitored</span>
        <span style={S.footDot} />
        <span>12 signal types</span>
      </div>
    </div>
  );
}
