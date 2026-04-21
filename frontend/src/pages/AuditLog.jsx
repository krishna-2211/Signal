import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { getAuditLog } from "../services/api";
import "../styles/audit-log.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}

function todayLabel() {
  return new Date()
    .toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
}

function truncate(str, len = 80) {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  started:   "Started",
  completed: "Completed",
  error:     "Error",
};

function StatusBadge({ status }) {
  const s = (status ?? "info").toLowerCase();
  const label = STATUS_LABEL[s] ?? status;
  return (
    <span className={`badge status-${s}`}>
      <span className="sigil" />
      {label}
    </span>
  );
}

// ── AuditRow ──────────────────────────────────────────────────────────────────

function AuditRow({ entry }) {
  return (
    <tr>
      <td><span className="ts">{formatTimestamp(entry.created_at)}</span></td>
      <td><span className="agent-badge">{entry.agent_name ?? "unknown"}</span></td>
      <td>
        {entry.client_name
          ? <span className="name">{entry.client_name}</span>
          : <span className="system-tag">system</span>
        }
      </td>
      <td><StatusBadge status={entry.status} /></td>
      <td>
        <span className="msg-cell" title={entry.message ?? ""}>
          {truncate(entry.message)}
        </span>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["All", "Completed", "Started", "Error"];

export default function AuditLog() {
  const { user }            = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Filters
  const [agentFilter,  setAgentFilter]  = useState("all");
  const [statusFilter, setStatusFilter] = useState("All");
  const [clientSearch, setClientSearch] = useState("");

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLog(500);
      setEntries(res.entries ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  // Unique agent names for dropdown
  const agentNames = useMemo(() => {
    const names = [...new Set(entries.map((e) => e.agent_name).filter(Boolean))].sort();
    return names;
  }, [entries]);

  // Filtered list
  const visible = useMemo(() => {
    let list = entries;

    if (agentFilter !== "all") {
      list = list.filter((e) => e.agent_name === agentFilter);
    }
    if (statusFilter !== "All") {
      list = list.filter((e) => (e.status ?? "").toLowerCase() === statusFilter.toLowerCase());
    }
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      list = list.filter((e) => (e.client_name ?? "system").toLowerCase().includes(q));
    }

    return list;
  }, [entries, agentFilter, statusFilter, clientSearch]);

  // Status tab counts
  const statusCounts = useMemo(() => {
    const counts = { All: entries.length };
    for (const e of entries) {
      const s = (e.status ?? "info");
      const key = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  return (
    <div className="app">

      <Sidebar activePage="audit" />

      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-crumb">
            <span>Workspace</span>
            <span className="sep">/</span>
            <span className="cur">Audit Log</span>
          </div>
          <div className="topbar-right">
            <div className="pill-status">
              <span className="dot" />
              <span>Pipeline · live</span>
            </div>
            <div className="user">
              <div className="avatar">
                {user?.name?.split(" ").map(w => w[0]).slice(0, 2).join("") ?? "—"}
              </div>
              <div className="user-meta">
                <div className="user-name">{user?.name ?? "—"}</div>
                <div className="user-role">
                  {user?.role === "risk" ? "Risk Manager" : "Relationship Manager"} · {user?.id ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="content">
          {/* Page header */}
          <div className="header">
            <div>
              <div className="greet-date"><span>{todayLabel()}</span></div>
              <h1 className="greet-title">Audit Log</h1>
              <p className="greet-sub">
                <strong style={{ color: "var(--text-1)" }}>{entries.length} pipeline events</strong> logged.
              </p>
            </div>
          </div>

          {/* Section head + search */}
          <div className="section-head">
            <h2>Pipeline events</h2>
            <span className="count-chip">{visible.length}</span>
            <div className="right">
              {/* Agent filter */}
              <select
                className="filter-select"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
              >
                <option value="all">All agents</option>
                {agentNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              {/* Client search */}
              <div className="search">
                <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5L14 14" />
                </svg>
                <input
                  placeholder="Search client…"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Status tabs */}
          <div className="tabs">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                className={`tab${statusFilter === s ? " active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s !== "All" && (
                  <span className={`dot ${
                    s === "Completed" ? "green" :
                    s === "Error"     ? "red"   :
                    s === "Started"   ? "gray"  : "gray"
                  }`} />
                )}
                {s}
                <span className="n">{statusCounts[s] ?? 0}</span>
              </button>
            ))}
          </div>

          {/* States */}
          {loading && (
            <div className="state-box">
              <div className="spinner" />
              <div className="state-title">Loading audit log…</div>
            </div>
          )}

          {!loading && error && (
            <div className="state-box">
              <div className="state-title">Failed to load audit log</div>
              <div>{error}</div>
              <button className="btn" onClick={fetchData}>Retry</button>
            </div>
          )}

          {!loading && !error && (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th style={{ width: "16%" }}>Timestamp</th>
                    <th style={{ width: "16%" }}>Agent</th>
                    <th style={{ width: "14%" }}>Client</th>
                    <th style={{ width: "10%" }}>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>
                        No events match the current filters.
                      </td>
                    </tr>
                  ) : (
                    visible.map((e, i) => <AuditRow key={e.id ?? i} entry={e} />)
                  )}
                </tbody>
              </table>
              <div className="table-foot">
                <span>Showing {visible.length} of {entries.length} events</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
