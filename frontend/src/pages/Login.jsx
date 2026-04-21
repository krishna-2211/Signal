import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLE_REDIRECT = {
  rm:   "/rm/brief",
  risk: "/risk/dashboard",
};

const ALL_DEMO_USERS = [
  { email: "sarah.mitchell@signal.com", password: "sarah123", label: "Sarah Mitchell", role: "RM · rm_001",       hint: "rm" },
  { email: "james.okafor@signal.com",   password: "james123", label: "James Okafor",   role: "RM · rm_002",       hint: "rm" },
  { email: "priya.nair@signal.com",     password: "priya123", label: "Priya Nair",     role: "RM · rm_003",       hint: "rm" },
  { email: "marcus.webb@signal.com",    password: "marcus123", label: "Marcus Webb",   role: "Risk · risk_001",   hint: "risk" },
];

const PAGE_TITLE = {
  rm:   "Relationship Manager Sign In",
  risk: "Risk Manager Sign In",
};

const PAGE_SUB = {
  rm:   "Enter your RM credentials to access your brief.",
  risk: "Enter your credentials to access the risk dashboard.",
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
  wrap: {
    width: "100%", maxWidth: 380,
    display: "flex", flexDirection: "column", gap: 12,
  },
  card: {
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
  heading:  { fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 4px", color: "#e6e9ef" },
  sub:      { fontSize: 13, color: "#6b7482", margin: "0 0 28px" },
  fieldset: { display: "flex", flexDirection: "column", gap: 14 },
  label:    { display: "flex", flexDirection: "column", gap: 6 },
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
  inputError: { borderColor: "#7f2d2d" },
  errorBox: {
    background: "#1a0f0f", border: "1px solid #7f2d2d",
    borderRadius: 6, padding: "10px 12px",
    fontSize: 12.5, color: "#f87171",
  },
  divider:   { height: 1, background: "#1f242c", margin: "6px 0" },
  submitBtn: {
    width: "100%", marginTop: 6,
    background: "#e6e9ef", color: "#0b0d10",
    fontSize: 13.5, fontWeight: 600,
    padding: "11px 16px", borderRadius: 7,
    border: "none", cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "-0.005em",
    transition: "background 80ms, opacity 80ms",
  },
  demoCard: {
    background: "#0f1216",
    border: "1px solid #1f242c",
    borderRadius: 12,
    padding: "18px 20px",
  },
  demoLabel: {
    fontSize: 11, fontWeight: 500, color: "#4a5260",
    textTransform: "uppercase", letterSpacing: "0.08em",
    marginBottom: 12,
  },
  demoGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
  },
  demoItem: {
    background: "#14181d", border: "1px solid #1f242c",
    borderRadius: 6, padding: "8px 10px",
    cursor: "pointer", transition: "border-color 80ms",
    textAlign: "left",
  },
  demoName: { fontSize: 12, fontWeight: 500, color: "#a7b0bd", display: "block" },
  demoRole: { fontSize: 10.5, color: "#4a5260", display: "block", marginTop: 1 },
  demoPw:   { fontSize: 10.5, color: "#374150", display: "block", marginTop: 3, fontFamily: "'JetBrains Mono', monospace" },
};

export default function Login() {
  const navigate           = useNavigate();
  const [searchParams]     = useSearchParams();
  const { login }          = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const roleHint  = searchParams.get("role"); // "rm" | "risk" | null
  const demoUsers = roleHint
    ? ALL_DEMO_USERS.filter((u) => u.hint === roleHint)
    : ALL_DEMO_USERS;
  const pageTitle = PAGE_TITLE[roleHint] ?? "Sign in";
  const pageSub   = PAGE_SUB[roleHint]   ?? "Enter your credentials to access the dashboard.";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(ROLE_REDIRECT[user.role] ?? "/rm/brief", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(u) {
    setEmail(u.email);
    setPassword(u.password);
    setError(null);
  }

  const hasError = !!error;

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        {/* ── Login card ── */}
        <div style={S.card}>
          <Link to="/" style={{ ...S.brandRow, textDecoration: "none", color: "inherit" }}>
            <div style={S.brandMark}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: "#0b0d10", transform: "rotate(45deg)" }} />
            </div>
            <span style={S.brandName}>Signal</span>
          </Link>

          <h1 style={S.heading}>{pageTitle}</h1>
          <p style={S.sub}>{pageSub}</p>

          <form onSubmit={handleSubmit}>
            <div style={S.fieldset}>
              {error && <div style={S.errorBox}>{error}</div>}

              <label style={S.label}>
                <span style={S.labelText}>Email address</span>
                <input
                  style={{ ...S.input, ...(hasError ? S.inputError : {}) }}
                  type="email"
                  placeholder="you@signal.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  autoComplete="email"
                  required
                  onFocus={(e)  => { e.target.style.borderColor = "#374150"; }}
                  onBlur={(e)   => { e.target.style.borderColor = hasError ? "#7f2d2d" : "#1f242c"; }}
                />
              </label>

              <label style={S.label}>
                <span style={S.labelText}>Password</span>
                <input
                  style={{ ...S.input, ...(hasError ? S.inputError : {}) }}
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  autoComplete="current-password"
                  required
                  onFocus={(e)  => { e.target.style.borderColor = "#374150"; }}
                  onBlur={(e)   => { e.target.style.borderColor = hasError ? "#7f2d2d" : "#1f242c"; }}
                />
              </label>

              <div style={S.divider} />

              <button
                type="submit"
                style={{ ...S.submitBtn, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
                disabled={loading}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#e6e9ef"; }}
              >
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Demo credentials ── */}
        <div style={S.demoCard}>
          <div style={S.demoLabel}>Demo credentials — click to fill</div>
          <div style={{ ...S.demoGrid, gridTemplateColumns: demoUsers.length === 1 ? "1fr" : "1fr 1fr" }}>
            {demoUsers.map((u) => (
              <button
                key={u.email}
                style={S.demoItem}
                onClick={() => fillDemo(u)}
                type="button"
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#374150"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1f242c"; }}
              >
                <span style={S.demoName}>{u.label}</span>
                <span style={S.demoRole}>{u.role}</span>
                <span style={S.demoPw}>{u.password}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
