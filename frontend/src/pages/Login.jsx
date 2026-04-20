import { useState } from "react";
import { useNavigate } from "react-router-dom";

const ROLE_REDIRECT = {
  rm:   "/rm/brief",
  risk: "/risk/dashboard",
};

const S = {
  page: {
    minHeight: "100vh",
    background: "#0b0d10",
    color: "#e6e9ef",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px",
    WebkitFontSmoothing: "antialiased",
    letterSpacing: "-0.005em",
  },
  card: {
    width: "100%", maxWidth: 380,
    background: "#0f1216",
    border: "1px solid #1f242c",
    borderRadius: 12,
    padding: "32px 28px",
  },
  brandRow: {
    display: "flex", alignItems: "center", gap: 8,
    marginBottom: 28,
  },
  brandMark: {
    width: 22, height: 22, borderRadius: 6,
    background: "linear-gradient(135deg, #e6e9ef 0%, #8b95a7 100%)",
    display: "grid", placeItems: "center",
  },
  brandName: { fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" },
  heading: {
    fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em",
    margin: "0 0 4px", color: "#e6e9ef",
  },
  sub: { fontSize: 13, color: "#6b7482", margin: "0 0 28px" },
  fieldset: { display: "flex", flexDirection: "column", gap: 14 },
  label: { display: "flex", flexDirection: "column", gap: 6 },
  labelText: {
    fontSize: 11.5, fontWeight: 500, color: "#6b7482",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  input: {
    background: "#14181d", border: "1px solid #1f242c",
    borderRadius: 6, padding: "9px 12px",
    color: "#e6e9ef", fontSize: 13.5,
    fontFamily: "inherit", outline: "none",
    transition: "border-color 100ms",
  },
  select: {
    background: "#14181d", border: "1px solid #1f242c",
    borderRadius: 6, padding: "9px 12px",
    color: "#e6e9ef", fontSize: 13.5,
    fontFamily: "inherit", outline: "none",
    cursor: "pointer", width: "100%",
    appearance: "none",
    transition: "border-color 100ms",
  },
  selectWrap: { position: "relative" },
  selectArrow: {
    position: "absolute", right: 10, top: "50%",
    transform: "translateY(-50%)",
    color: "#6b7482", pointerEvents: "none", fontSize: 11,
  },
  divider: { height: 1, background: "#1f242c", margin: "6px 0" },
  submitBtn: {
    width: "100%", marginTop: 6,
    background: "#e6e9ef", color: "#0b0d10",
    fontSize: 13.5, fontWeight: 600,
    padding: "11px 16px", borderRadius: 7,
    border: "none", cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "-0.005em",
    transition: "background 80ms",
  },
  backLink: {
    textAlign: "center", marginTop: 18,
    fontSize: 12.5, color: "#6b7482",
  },
  backA: {
    color: "#a7b0bd", textDecoration: "none", cursor: "pointer",
  },
};

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState("rm");

  function handleSubmit(e) {
    e.preventDefault();
    navigate(ROLE_REDIRECT[role] ?? "/rm/brief");
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Brand */}
        <div style={S.brandRow}>
          <div style={S.brandMark}>
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: "#0b0d10", transform: "rotate(45deg)",
            }} />
          </div>
          <span style={S.brandName}>Signal</span>
        </div>

        <h1 style={S.heading}>Sign in</h1>
        <p style={S.sub}>Choose your role to continue to the dashboard.</p>

        <form onSubmit={handleSubmit}>
          <div style={S.fieldset}>
            {/* Email */}
            <label style={S.label}>
              <span style={S.labelText}>Email address</span>
              <input
                style={S.input}
                type="email"
                placeholder="you@yourbank.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                onFocus={(e) => { e.target.style.borderColor = "#374150"; }}
                onBlur={(e) => { e.target.style.borderColor = "#1f242c"; }}
              />
            </label>

            {/* Role */}
            <label style={S.label}>
              <span style={S.labelText}>Role</span>
              <div style={S.selectWrap}>
                <select
                  style={S.select}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  onFocus={(e) => { e.target.style.borderColor = "#374150"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#1f242c"; }}
                >
                  <option value="rm">Relationship Manager</option>
                  <option value="risk">Risk Manager</option>
                </select>
                <span style={S.selectArrow}>▾</span>
              </div>
            </label>

            <div style={S.divider} />

            <button
              type="submit"
              style={S.submitBtn}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#e6e9ef"; }}
            >
              Continue →
            </button>
          </div>
        </form>

        <p style={S.backLink}>
          <span
            style={S.backA}
            onClick={() => navigate("/")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") navigate("/"); }}
          >
            ← Back to home
          </span>
        </p>
      </div>
    </div>
  );
}
