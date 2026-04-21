import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/Sidebar";
import { getRiskDashboard, runPipeline } from "../../services/api";
import "../../styles/risk-dashboard.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all",               label: "All",          dot: null },
  { key: "credit_stress",     label: "Credit Stress", dot: "red" },
  { key: "churn_risk",        label: "Churn Risk",   dot: "amber" },
  { key: "upsell_opportunity",label: "Upsell",       dot: "green" },
  { key: "none",              label: "Stable",       dot: "gray" },
];

const SORT_OPTIONS = [
  { value: "severity",  label: "Severity" },
  { value: "impact",    label: "Dollar Impact" },
  { value: "name",      label: "Client Name" },
  { value: "signal",    label: "Signal Type" },
];

const SEV_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };

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

const IMPACT_SUB = {
  credit_stress:       "Exposure",
  churn_risk:          "Rel. value",
  upsell_opportunity:  "Opportunity",
  none:                null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDollars(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function todayLabel() {
  return new Date()
    .toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
}

function rmInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
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

function isFresh(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 12 * 3_600_000;
}

// Flatten all clients from by_signal_type grouping into a single array
function flattenClients(bySignalType) {
  if (!bySignalType) return [];
  const seen = new Set();
  const out = [];
  for (const clients of Object.values(bySignalType)) {
    for (const c of clients) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

// ── SectorBanner ──────────────────────────────────────────────────────────────

function SectorBanner({ sector }) {
  const clients = sector.clients ?? [];
  const clientNames = clients.join(", ");
  return (
    <div className="banner">
      <div className="banner-icon">
        <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5L14.5 13H1.5L8 1.5z" />
          <path d="M8 6v4M8 12v.01" />
        </svg>
      </div>
      <div className="banner-body">
        <div className="banner-row1">
          <span className="banner-tag">
            <span className="dot" />
            Sector Stress
          </span>
          <span className="banner-title">{sector.industry}</span>
        </div>
        <div className="banner-text">
          <strong>{clients.length} clients</strong> in the same sector are showing
          Credit Stress simultaneously. Possible sector-wide deterioration — recommend a
          concentration review before the next committee.
        </div>
        <div className="banner-meta">
          <span>Clients: <strong>{clientNames}</strong></span>
        </div>
      </div>
      <div className="banner-actions">
        <button className="btn sm">Snooze</button>
        <button className="btn sm primary">
          <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6h8M6 2l4 4-4 4" />
          </svg>
          Open Review
        </button>
      </div>
    </div>
  );
}

// ── ClientRow ─────────────────────────────────────────────────────────────────

function ClientRow({ client }) {
  const navigate    = useNavigate();
  const signalType  = client.signal_type ?? "none";
  const severity    = client.severity ?? "NONE";
  const rowClass    = ROW_CLASS[signalType] ?? "row-gray";
  const badgeClass  = SIGNAL_BADGE[signalType] ?? "signal-gray";
  const signalLabel = SIGNAL_LABEL[signalType] ?? signalType;
  const sevClass    = severity.toLowerCase();
  const impactSub   = IMPACT_SUB[signalType];

  // Derive a display impact: loan_balance*0.15 for credit_stress, else annual_revenue proxy
  let impactVal = null;
  if (signalType === "credit_stress" && client.loan_balance) {
    impactVal = client.loan_balance * 0.15;
  } else if (signalType === "churn_risk" && client.annual_revenue) {
    impactVal = client.annual_revenue * 0.1; // estimated relationship revenue
  } else if (signalType === "upsell_opportunity" && client.score) {
    impactVal = null; // shown as opportunity from brief; omit here
  }

  const updatedAt  = client.signal_run_date;
  const isPositive = signalType === "upsell_opportunity";

  return (
    <tr
      className={rowClass}
      onClick={() => navigate(`/rm/client/${client.id}`)}
      style={{ cursor: "pointer" }}
    >
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
        <span className={`badge ${badgeClass}`}>
          <span className="sigil" />
          {signalLabel}
        </span>
      </td>
      <td>
        <span className={`badge sev ${sevClass}`}>
          <span className="sigil" />
          {severity.charAt(0) + severity.slice(1).toLowerCase()}
        </span>
      </td>
      <td className="num">
        {impactVal ? (
          <div className={`impact-cell${isPositive ? " pos" : ""}`}>
            {isPositive ? "+" : ""}{formatDollars(impactVal)}
            {impactSub && <span className="sub">{impactSub}</span>}
          </div>
        ) : (
          <span style={{ color: "var(--text-3)" }}>—</span>
        )}
      </td>
      <td>
        <span className={`updated${isFresh(updatedAt) ? " fresh" : ""}`}>
          {relativeDate(updatedAt)}
        </span>
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

export default function RiskDashboard() {
  const { user }              = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter]   = useState("all");
  const [sortBy, setSortBy]   = useState("severity");
  const [sortDir, setSortDir] = useState("asc");
  const [search, setSearch]   = useState("");

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

  async function handleRunPipeline() {
    if (running) return;
    setRunning(true);
    try {
      await runPipeline();
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  function handleSortClick(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  // Derive flat client list
  const allClients = useMemo(
    () => flattenClients(data?.by_signal_type),
    [data]
  );

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: allClients.length };
    for (const c of allClients) {
      const k = c.signal_type ?? "none";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [allClients]);

  // Filter + search + sort
  const visibleClients = useMemo(() => {
    let list = allClients;

    if (filter !== "all") {
      list = list.filter((c) => (c.signal_type ?? "none") === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.industry?.toLowerCase().includes(q) ||
          c.rm_name?.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "severity") {
        cmp = (SEV_ORDER[a.severity ?? "NONE"] ?? 4) - (SEV_ORDER[b.severity ?? "NONE"] ?? 4);
      } else if (sortBy === "name") {
        cmp = (a.name ?? "").localeCompare(b.name ?? "");
      } else if (sortBy === "signal") {
        cmp = (a.signal_type ?? "none").localeCompare(b.signal_type ?? "none");
      } else if (sortBy === "impact") {
        cmp = (b.score ?? 0) - (a.score ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [allClients, filter, search, sortBy, sortDir]);

  const severityCounts  = data?.severity_counts  ?? {};
  const stressedSectors = data?.stressed_sectors ?? [];
  const highCount       = severityCounts.HIGH ?? 0;
  const medCount        = severityCounts.MEDIUM ?? 0;
  const lowCount        = severityCounts.LOW ?? 0;
  const totalClients    = data?.total_clients ?? 0;
  const escalationCount = data?.escalation_count ?? 0;

  const sortCaret = (col) => (
    <span className="sort-caret">
      {sortBy === col ? (sortDir === "asc" ? "↑" : "↓") : "↓"}
    </span>
  );

  return (
    <div className="app">

      <Sidebar
        activePage="risk-dashboard"
        badge={{ "risk-dashboard": highCount, "risk-dashboard_hot": highCount > 0 }}
      />

      {/* ── Main ── */}
      <main className="main">

        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-crumb">
            <span>Workspace</span>
            <span className="sep">/</span>
            <span className="cur">Portfolio Risk</span>
          </div>
          <div className="topbar-right">
            <div className="pill-status">
              <span className="dot" />
              <span>Pipeline · live</span>
            </div>
            <button className="run-btn" onClick={handleRunPipeline} disabled={running}>
              {running ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Running…
                </>
              ) : (
                <>
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 3l9 5-9 5V3z" fill="currentColor" />
                  </svg>
                  Run Pipeline
                  <span className="kbd" style={{ background: "rgba(0,0,0,0.08)", color: "rgba(0,0,0,0.5)", borderColor: "rgba(0,0,0,0.1)" }}>R</span>
                </>
              )}
            </button>
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

          {/* Header */}
          <div className="header">
            <div className="greet-date">
              <span>{todayLabel()}</span>
              <span className="sep">·</span>
              <span>COMMERCIAL PORTFOLIO</span>
            </div>
            <h1 className="greet-title">Portfolio risk overview</h1>
            <p className="greet-sub">
              Monitoring{" "}
              <strong style={{ color: "var(--text-1)" }}>{totalClients} accounts</strong>.
              {highCount > 0 && (
                <> <strong style={{ color: "var(--text-1)" }}>{highCount} high-severity signals</strong> open.</>
              )}
              {stressedSectors.length > 0 && (
                <> {stressedSectors.length} sector{stressedSectors.length > 1 ? "s" : ""} showing concentration stress.</>
              )}
            </p>
          </div>

          {/* Metric row */}
          <div className="metrics">
            <div className="metric">
              <div className="metric-header">
                <div className="metric-label">
                  <span className="swatch" style={{ background: "var(--text-3)" }} />
                  Total Portfolio
                </div>
                <div className="metric-trend flat">—</div>
              </div>
              <div className="metric-value">
                {totalClients}
                <span className="unit"> accounts</span>
              </div>
              <div className="metric-foot">Across all relationship managers</div>
            </div>

            <div className="metric">
              <div className="metric-header">
                <div className="metric-label">
                  <span className="swatch" style={{ background: "var(--red)" }} />
                  High Severity
                </div>
                {highCount > 0 && <div className="metric-trend up">▲ {highCount}</div>}
              </div>
              <div className="metric-value">
                {highCount}
                <span className="unit"> signals</span>
              </div>
              {(highCount + medCount + lowCount) > 0 && (
                <div className="sev-dist">
                  <span style={{ flex: highCount || 1, background: "var(--red)" }} />
                  <span style={{ flex: medCount || 0, background: "var(--amber)" }} />
                  <span style={{ flex: lowCount || 0, background: "var(--text-3)" }} />
                </div>
              )}
              <div className="metric-foot">
                <span style={{ color: "var(--red-text)" }}>{highCount} high</span>
                {" · "}
                <span style={{ color: "var(--amber-text)" }}>{medCount} med</span>
                {" · "}
                <span>{lowCount} low</span>
              </div>
            </div>

            <div className="metric">
              <div className="metric-header">
                <div className="metric-label">
                  <span className="swatch" style={{ background: "var(--amber)" }} />
                  Escalations
                </div>
                {escalationCount > 0 && <div className="metric-trend up">▲ {escalationCount}</div>}
              </div>
              <div className="metric-value">
                {escalationCount}
                <span className="unit"> open</span>
              </div>
              <div className="metric-foot">High and medium severity signals</div>
            </div>

            <div className="metric">
              <div className="metric-header">
                <div className="metric-label">
                  <span className="swatch" style={{ background: "var(--red)" }} />
                  Sector Alerts
                </div>
                {stressedSectors.length > 0 && <div className="metric-trend up">▲ {stressedSectors.length}</div>}
              </div>
              <div className="metric-value">
                {stressedSectors.length}
                <span className="unit"> sector{stressedSectors.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="metric-foot">
                {stressedSectors.length > 0 ? (
                  stressedSectors.map((s, i) => (
                    <span key={s.industry}>
                      {i > 0 && ", "}
                      <strong style={{ color: "var(--red-text)" }}>{s.industry}</strong>
                    </span>
                  ))
                ) : (
                  <span>No sector stress detected</span>
                )}
              </div>
            </div>
          </div>

          {/* Sector stress banners */}
          {stressedSectors.map((s) => (
            <SectorBanner key={s.industry} sector={s} />
          ))}

          {/* Section head */}
          <div className="section-head">
            <h2>Portfolio accounts</h2>
            <span className="count-chip">{visibleClients.length}</span>
            <div className="right">
              <div className="search">
                <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5L14 14" />
                </svg>
                <input
                  placeholder="Search client, RM, or industry…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="tabs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`tab${filter === f.key ? " active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.dot && <span className={`dot ${f.dot}`} />}
                {f.label}
                <span className="n">{tabCounts[f.key] ?? 0}</span>
              </button>
            ))}
          </div>

          {/* Loading / error / table */}
          {loading && (
            <div className="state-box">
              <div className="spinner" />
              <div className="state-title">Loading portfolio…</div>
            </div>
          )}

          {!loading && error && (
            <div className="state-box">
              <div className="state-title">Failed to load dashboard</div>
              <div>{error}</div>
              <button className="btn" onClick={fetchData}>Retry</button>
            </div>
          )}

          {!loading && !error && (
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
                    <th style={{ width: "12%" }}>RM Assigned</th>
                    <th
                      style={{ width: "13%" }}
                      className={sortBy === "signal" ? "sorted" : ""}
                      onClick={() => handleSortClick("signal")}
                    >
                      Signal {sortCaret("signal")}
                    </th>
                    <th
                      style={{ width: "9%" }}
                      className={sortBy === "severity" ? "sorted" : ""}
                      onClick={() => handleSortClick("severity")}
                    >
                      Severity {sortCaret("severity")}
                    </th>
                    <th
                      className={`num${sortBy === "impact" ? " sorted" : ""}`}
                      style={{ width: "12%" }}
                      onClick={() => handleSortClick("impact")}
                    >
                      Dollar Impact {sortCaret("impact")}
                    </th>
                    <th style={{ width: "9%" }}>Last Updated</th>
                    <th className="num" style={{ width: "10%" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClients.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>
                        No accounts match the current filter.
                      </td>
                    </tr>
                  ) : (
                    visibleClients.map((c) => <ClientRow key={c.id} client={c} />)
                  )}
                </tbody>
              </table>
              <div className="table-foot">
                <span>
                  Showing {visibleClients.length} of {totalClients} accounts
                </span>
              </div>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
