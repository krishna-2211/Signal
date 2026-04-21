import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IcoBrief = () => (
  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6.5l6-4 6 4V13a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" />
    <path d="M6 14V9h4v5" />
  </svg>
);

const IcoPortfolio = () => (
  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3.5" width="12" height="10" rx="1.5" />
    <path d="M2 6.5h12" />
    <path d="M6 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1" />
  </svg>
);

const IcoRisk = () => (
  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 13V3m0 10h12M5 10V7m3 3V5m3 5V8" />
  </svg>
);

const IcoEscalation = () => (
  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5L14.5 13H1.5L8 1.5z" />
    <path d="M8 6v4M8 12v.01" />
  </svg>
);

const IcoAudit = () => (
  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M2 8h12M2 12h8" />
  </svg>
);

const IcoSwitch = () => (
  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5h9l-2-2M14 11H5l2 2" />
  </svg>
);

const IcoArrow = () => (
  <svg className="arrow" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4l4 4-4 4" />
  </svg>
);

const IcoLogout = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3" />
    <path d="M10 11l3-3-3-3M13 8H6" />
  </svg>
);

// ── Nav definitions ───────────────────────────────────────────────────────────

const RM_NAV = [
  { key: "brief",     to: "/rm/brief",     label: "Today's Brief",  Icon: IcoBrief },
  { key: "portfolio", to: "/rm/portfolio", label: "My Portfolio",   Icon: IcoPortfolio },
  { key: "audit",     to: "/audit",        label: "Audit Log",      Icon: IcoAudit },
];

const RISK_NAV = [
  { key: "risk-dashboard", to: "/risk/dashboard",   label: "Risk Dashboard",   Icon: IcoRisk },
  { key: "escalations",    to: "/risk/escalations", label: "Escalation Queue", Icon: IcoEscalation },
  { key: "audit",          to: "/audit",            label: "Audit Log",        Icon: IcoAudit },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {string}  activePage  - key of the currently active nav item
 * @param {object}  badge       - { brief: 3, escalations: 2, "escalations_hot": true }
 */
export default function Sidebar({ activePage, badge = {} }) {
  const { user, logout } = useAuth();
  const isRisk = user?.role === "risk";
  const nav    = isRisk ? RISK_NAV : RM_NAV;

  const switchLink = isRisk
    ? { to: "/login?role=rm",   label: "Switch to RM View" }
    : { to: "/login?role=risk", label: "Switch to Risk View" };

  return (
    <aside className="sidebar" style={{ display: "flex", flexDirection: "column" }}>
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-name">Signal</div>
        {isRisk && <span className="mode-chip">RISK</span>}
      </div>

      {/* Nav */}
      <div className="nav-label">Workspace</div>

      {nav.map(({ key, to, label, Icon }) => {
        const count   = badge[key];
        const isHot   = badge[key + "_hot"];
        return (
          <Link key={key} to={to} className={`nav-item${activePage === key ? " active" : ""}`}>
            <Icon />
            {label}
            {count != null && (
              <span className={`count${isHot ? " hot" : ""}`}>{count}</span>
            )}
          </Link>
        );
      })}

      {/* View switch */}
      <div className="divider" />

      <Link to={switchLink.to} className="view-switch">
        <IcoSwitch />
        {switchLink.label}
        <IcoArrow />
      </Link>

      {/* User footer */}
      <div style={{ flex: 1 }} />
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--line-1)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: "var(--bg-3)",
          display: "grid", placeItems: "center",
          fontSize: 10.5, fontWeight: 600,
          color: "var(--text-2)",
          flexShrink: 0,
        }}>
          {initials(user?.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user?.name ?? "—"}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user?.id ?? "—"}
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          style={{
            background: "none", border: "none",
            color: "var(--text-3)", cursor: "pointer",
            padding: 4, borderRadius: 5,
            display: "grid", placeItems: "center",
            flexShrink: 0,
            transition: "color 100ms, background 100ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.background = "var(--bg-3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "none"; }}
        >
          <IcoLogout />
        </button>
      </div>
    </aside>
  );
}
