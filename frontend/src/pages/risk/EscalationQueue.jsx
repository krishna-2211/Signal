import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/Sidebar";
import { getRiskDashboard } from "../../services/api";
import "../../styles/risk-dashboard.css";

const SIGNAL_BADGE = {
  credit_stress:       "signal-red",
  churn_risk:          "signal-amber",
  upsell_opportunity:  "signal-green",
  none:                "signal-gray",
};

const SIGNAL_LABEL = {
  credit_stress:       "Credit Stress",
  churn_risk:          "Churn Risk",
  upsell_opportunity:  "Upsell",
  none:                "Stable",
};

const ROW_CLASS = {
  credit_stress:       "row-red",
  churn_risk:          "row-amber",
  upsell_opportunity:  "row-green",
  none:                "row-gray",
};

const SEV_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };

function formatDollars(n) {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function relativeDate(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1)  return "just now";
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

function rmInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function flattenClients(bySignalType) {
  if (!bySignalType) return [];
  const seen = new Set();
  const out  = [];
  for (const clients of Object.values(bySignalType)) {
    for (const c of clients) {
      if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
  }
  return out;
}

function deriveImpact(client) {
  const sig = client.signal_type ?? "none";
  if (sig === "credit_stress" && client.loan_balance)
    return client.loan_balance * 0.15;
  if (sig === "churn_risk" && client.annual_revenue)
    return client.annual_revenue * 0.1;
  return null;
}

// ── EscalationRow ─────────────────────────────────────────────────────────────

function EscalationRow({ client }) {
  const signalType  = client.signal_type ?? "none";
  const severity    = client.severity ?? "NONE";
  const impact      = deriveImpact(client);

  return (
    <tr className={ROW_CLASS[signalType] ?? "row-gray"}>
      <td>
        <div className="client-cell">
          <Link className="name" to={`/rm/client/${client.id}`}>
            {client.name}
          </Link>
          <span className="id">{client.id}</span>
        </div>
      </td>
      <td>
        {client.industry && <span className="industry">{client.industry}</span>}
      </td>
      <td>
        <div className="rm-cell">
          <div className="rm-avatar">{rmInitials(client.rm_name)}</div>
          <span className="rm-name">{client.rm_name ?? "—"}</span>
        </div>
      </td>
      <td>
        <span className={`badge ${SIGNAL_BADGE[signalType] ?? "signal-gray"}`}>
          <span className="sigil" />
          {SIGNAL_LABEL[signalType] ?? signalType}
        </span>
      </td>
      <td>
        <span className="badge sev high">
          <span className="sigil" />
          High
        </span>
      </td>
      <td className="num">
        {impact ? (
          <div className="impact-cell">{formatDollars(impact)}</div>
        ) : (
          <span style={{ color: "var(--text-3)" }}>—</span>
        )}
      </td>
      <td>
        <span className="updated">{relativeDate(client.signal_run_date)}</span>
      </td>
      <td>
        <div className="action-row">
          <Link className="icon-btn" to={`/rm/client/${client.id}`} title="Open">
            <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 2l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EscalationQueue() {
  const { user }              = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [sortBy, setSortBy]   = useState("severity");
  const [sortDir, setSortDir] = useState("asc");

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await getRiskDashboard();
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  function handleSortClick(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  // Flatten all clients then keep only HIGH severity
  const escalations = useMemo(() => {
    const all = flattenClients(data?.by_signal_type);
    const high = all.filter((c) => (c.severity ?? "").toUpperCase() === "HIGH");

    return [...high].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "severity") {
        cmp = (SEV_ORDER[a.severity ?? "NONE"] ?? 4) - (SEV_ORDER[b.severity ?? "NONE"] ?? 4);
      } else if (sortBy === "name") {
        cmp = (a.name ?? "").localeCompare(b.name ?? "");
      } else if (sortBy === "signal") {
        cmp = (a.signal_type ?? "none").localeCompare(b.signal_type ?? "none");
      } else if (sortBy === "impact") {
        cmp = (deriveImpact(b) ?? 0) - (deriveImpact(a) ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortBy, sortDir]);

  const totalClients    = data?.total_clients ?? 0;
  const escalationCount = escalations.length;

  const sortCaret = (col) => (
    <span className="sort-caret">
      {sortBy === col ? (sortDir === "asc" ? "↑" : "↓") : "↓"}
    </span>
  );

  return (
    <div className="app">

      <Sidebar
        activePage="escalations"
        badge={{ escalations: escalationCount, escalations_hot: escalationCount > 0 }}
      />

      {/* ── Main ── */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-crumb">
            <span>Risk</span>
            <span className="sep">/</span>
            <span className="cur">Escalation Queue</span>
          </div>
          <div className="topbar-right">
            <div className="pill-status">
              <span className="dot" />
              <span>Pipeline · live</span>
            </div>
            <div className="user">
              <div className="avatar">{user?.name?.split(" ").map(w => w[0]).slice(0,2).join("") ?? "RM"}</div>
              <div className="user-meta">
                <div className="user-name">{user?.name ?? "—"}</div>
                <div className="user-role">Risk Manager · {user?.id ?? "—"}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="content">
          <div className="header">
            <div className="greet-date">
              <span>{new Date().toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</span>
              <span className="sep">·</span>
              <span>HIGH SEVERITY ONLY</span>
            </div>
            <h1 className="greet-title">Escalation Queue</h1>
            <p className="greet-sub">
              <strong style={{ color: "var(--red-text)" }}>{escalationCount} accounts</strong> flagged HIGH severity across {totalClients} monitored clients. These require immediate attention.
            </p>
          </div>

          {/* Summary strip */}
          <div className="metrics" style={{ gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 500, marginBottom: 28 }}>
            <div className="metric">
              <div className="metric-header">
                <div className="metric-label">
                  <span className="swatch" style={{ background: "var(--red)" }} />
                  High Severity
                </div>
              </div>
              <div className="metric-value" style={{ color: "var(--red-text)" }}>
                {escalationCount}
                <span className="unit"> accounts</span>
              </div>
              <div className="metric-foot">Require immediate action</div>
            </div>
            <div className="metric">
              <div className="metric-header">
                <div className="metric-label">
                  <span className="swatch" style={{ background: "var(--text-3)" }} />
                  Portfolio Coverage
                </div>
              </div>
              <div className="metric-value">
                {totalClients}
                <span className="unit"> total</span>
              </div>
              <div className="metric-foot">Accounts monitored</div>
            </div>
          </div>

          {/* Section head */}
          <div className="section-head">
            <h2>Escalated accounts</h2>
            <span className="count-chip">{escalationCount}</span>
          </div>

          {/* States */}
          {loading && (
            <div className="state-box">
              <div className="spinner" />
              <div className="state-title">Loading escalations…</div>
            </div>
          )}

          {!loading && error && (
            <div className="state-box">
              <div className="state-title">Failed to load data</div>
              <div>{error}</div>
              <button className="btn" onClick={fetchData}>Retry</button>
            </div>
          )}

          {!loading && !error && escalationCount === 0 && (
            <div className="state-box">
              <div className="state-title">No high-severity escalations</div>
              <div>All accounts are within acceptable risk thresholds.</div>
            </div>
          )}

          {!loading && !error && escalationCount > 0 && (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th
                      style={{ width: "22%" }}
                      className={sortBy === "name" ? "sorted" : ""}
                      onClick={() => handleSortClick("name")}
                    >
                      Client {sortCaret("name")}
                    </th>
                    <th style={{ width: "13%" }}>Industry</th>
                    <th style={{ width: "13%" }}>RM Assigned</th>
                    <th
                      style={{ width: "13%" }}
                      className={sortBy === "signal" ? "sorted" : ""}
                      onClick={() => handleSortClick("signal")}
                    >
                      Signal {sortCaret("signal")}
                    </th>
                    <th style={{ width: "9%" }}>Severity</th>
                    <th
                      className={`num${sortBy === "impact" ? " sorted" : ""}`}
                      style={{ width: "13%" }}
                      onClick={() => handleSortClick("impact")}
                    >
                      Dollar Impact {sortCaret("impact")}
                    </th>
                    <th style={{ width: "9%" }}>Last Updated</th>
                    <th className="num" style={{ width: "8%" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {escalations.map((c) => (
                    <EscalationRow key={c.id} client={c} />
                  ))}
                </tbody>
              </table>
              <div className="table-foot">
                <span>{escalationCount} high-severity account{escalationCount !== 1 ? "s" : ""} requiring action</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
