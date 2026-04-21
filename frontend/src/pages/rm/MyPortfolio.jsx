import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/Sidebar";
import { getClients } from "../../services/api";
import "../../styles/risk-dashboard.css";


const SIGNAL_FILTERS = [
  { key: "all",                label: "All",           dot: null },
  { key: "credit_stress",      label: "Credit Stress", dot: "red" },
  { key: "churn_risk",         label: "Churn Risk",    dot: "amber" },
  { key: "upsell_opportunity", label: "Upsell",        dot: "green" },
  { key: "none",               label: "Stable",        dot: "gray" },
];

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

function deriveImpact(client) {
  const sig = client.latest_signal?.signal_type ?? "none";
  if (sig === "credit_stress" && client.loan_balance)
    return client.loan_balance * 0.15;
  if (sig === "churn_risk" && client.annual_revenue)
    return client.annual_revenue * 0.1;
  return null;
}

// ── ClientRow ─────────────────────────────────────────────────────────────────

function ClientRow({ client }) {
  const navigate   = useNavigate();
  const signalType = client.latest_signal?.signal_type ?? "none";
  const severity   = client.latest_signal?.severity ?? "NONE";
  const impact     = deriveImpact(client);

  return (
    <tr
      className={ROW_CLASS[signalType] ?? "row-gray"}
      style={{ cursor: "pointer" }}
      onClick={() => navigate(`/rm/client/${client.id}`)}
    >
      <td>
        <div className="client-cell">
          <span className="name">{client.name}</span>
          <span className="id">{client.id}</span>
        </div>
      </td>
      <td>
        {client.industry && <span className="industry">{client.industry}</span>}
      </td>
      <td>
        <span className={`badge ${SIGNAL_BADGE[signalType] ?? "signal-gray"}`}>
          <span className="sigil" />
          {SIGNAL_LABEL[signalType] ?? signalType}
        </span>
      </td>
      <td>
        {severity !== "NONE" ? (
          <span className={`badge sev ${severity.toLowerCase()}`}>
            <span className="sigil" />
            {severity.charAt(0) + severity.slice(1).toLowerCase()}
          </span>
        ) : (
          <span style={{ color: "var(--text-4)" }}>—</span>
        )}
      </td>
      <td className="num">
        {impact ? (
          <span className="impact-cell">{formatDollars(impact)}</span>
        ) : (
          <span style={{ color: "var(--text-3)" }}>—</span>
        )}
      </td>
      <td>
        <span className="updated">{relativeDate(client.latest_signal?.run_date)}</span>
      </td>
      <td>
        <div className="action-row">
          <Link
            className="icon-btn"
            to={`/rm/client/${client.id}`}
            title="View client"
            onClick={(e) => e.stopPropagation()}
          >
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

export default function MyPortfolio() {
  const { user }              = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("all");
  const [sortBy, setSortBy]   = useState("severity");
  const [sortDir, setSortDir] = useState("asc");

  async function fetchClients() {
    setLoading(true);
    setError(null);
    try {
      const res = await getClients();
      console.log('clients response:', res);
      setClients(Array.isArray(res) ? res : (res.clients ?? []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchClients(); }, []);

  function handleSortClick(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const tabCounts = useMemo(() => {
    const counts = { all: clients.length };
    for (const c of clients) {
      const k = c.latest_signal?.signal_type ?? "none";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [clients]);

  const visible = useMemo(() => {
    let list = filter === "all"
      ? clients
      : clients.filter((c) => (c.latest_signal?.signal_type ?? "none") === filter);

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "severity") {
        cmp = (SEV_ORDER[a.latest_signal?.severity ?? "NONE"] ?? 4) - (SEV_ORDER[b.latest_signal?.severity ?? "NONE"] ?? 4);
      } else if (sortBy === "name") {
        cmp = (a.name ?? "").localeCompare(b.name ?? "");
      } else if (sortBy === "impact") {
        cmp = (deriveImpact(b) ?? 0) - (deriveImpact(a) ?? 0);
      } else if (sortBy === "signal") {
        cmp = (a.latest_signal?.signal_type ?? "none").localeCompare(b.latest_signal?.signal_type ?? "none");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [clients, filter, sortBy, sortDir]);

  const sortCaret = (col) => (
    <span className="sort-caret">
      {sortBy === col ? (sortDir === "asc" ? "↑" : "↓") : "↓"}
    </span>
  );

  return (
    <div className="app">

      <Sidebar activePage="portfolio" badge={{ portfolio: clients.length }} />

      {/* ── Main ── */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-crumb">
            <span>Workspace</span>
            <span className="sep">/</span>
            <span className="cur">My Portfolio</span>
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
                <div className="user-role">Senior RM · {user?.id ?? "—"}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="content">
          <div className="header">
            <div className="greet-date">
              <span>{new Date().toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</span>
            </div>
            <h1 className="greet-title">My Portfolio</h1>
            <p className="greet-sub">
              <strong style={{ color: "var(--text-1)" }}>{clients.length} accounts</strong> across your book of business.
            </p>
          </div>

          {/* Section head + filter */}
          <div className="section-head">
            <h2>All clients</h2>
            <span className="count-chip">{visible.length}</span>
          </div>

          <div className="tabs">
            {SIGNAL_FILTERS.map((f) => (
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

          {/* States */}
          {loading && (
            <div className="state-box">
              <div className="spinner" />
              <div className="state-title">Loading portfolio…</div>
            </div>
          )}

          {!loading && error && (
            <div className="state-box">
              <div className="state-title">Failed to load clients</div>
              <div>{error}</div>
              <button className="btn" onClick={fetchClients}>Retry</button>
            </div>
          )}

          {!loading && !error && (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th
                      style={{ width: "26%" }}
                      className={sortBy === "name" ? "sorted" : ""}
                      onClick={() => handleSortClick("name")}
                    >
                      Client {sortCaret("name")}
                    </th>
                    <th style={{ width: "15%" }}>Industry</th>
                    <th
                      style={{ width: "14%" }}
                      className={sortBy === "signal" ? "sorted" : ""}
                      onClick={() => handleSortClick("signal")}
                    >
                      Signal Type {sortCaret("signal")}
                    </th>
                    <th
                      style={{ width: "10%" }}
                      className={sortBy === "severity" ? "sorted" : ""}
                      onClick={() => handleSortClick("severity")}
                    >
                      Severity {sortCaret("severity")}
                    </th>
                    <th
                      className={`num${sortBy === "impact" ? " sorted" : ""}`}
                      style={{ width: "13%" }}
                      onClick={() => handleSortClick("impact")}
                    >
                      Dollar Impact {sortCaret("impact")}
                    </th>
                    <th style={{ width: "11%" }}>Last Updated</th>
                    <th className="num" style={{ width: "11%" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>
                        No accounts match the current filter.
                      </td>
                    </tr>
                  ) : (
                    visible.map((c) => <ClientRow key={c.id} client={c} />)
                  )}
                </tbody>
              </table>
              <div className="table-foot">
                <span>Showing {visible.length} of {clients.length} accounts</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
