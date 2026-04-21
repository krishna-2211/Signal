import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/Sidebar";
import { actionBrief, getTodaysBriefs, runPipeline } from "../../services/api";
import { getSignalTheme, SIGNAL_LABEL } from "../../utils/signalColors";
import "../../styles/todays-brief.css";

const IMPACT_LABEL = {
  revenue_at_risk:    "Revenue at risk",
  potential_loss:     "Exposure at risk",
  revenue_opportunity:"Revenue opportunity",
  none:               "Impact",
};

function formatDollars(n) {
  if (n == null) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).toUpperCase();
}

// ── Summary counts ────────────────────────────────────────────────────────────

function computeSummary(briefs) {
  const counts = { credit_stress: 0, churn_risk: 0, upsell_opportunity: 0 };
  let totalImpact = 0;
  for (const b of briefs) {
    if (b.signal_type in counts) counts[b.signal_type]++;
    totalImpact += b.dollar_impact || 0;
  }
  return { counts, totalImpact };
}

// ── Action icon per signal type ───────────────────────────────────────────────

function ActionIcon({ signalType }) {
  if (signalType === "credit_stress") {
    return (
      <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 1v7M6 11v.01" />
      </svg>
    );
  }
  if (signalType === "upsell_opportunity") {
    return (
      <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 10l3-3 2 2 3-4" /><path d="M8 5h2v2" />
      </svg>
    );
  }
  // churn_risk
  return (
    <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6h10M7 2l4 4-4 4" />
    </svg>
  );
}

// ── BriefCard ─────────────────────────────────────────────────────────────────

function BriefCard({ brief, actioned, onAction }) {
  const [actioning, setActioning] = useState(false);

  const theme       = getSignalTheme(brief.signal_type);
  const color       = theme.cardClass;
  const badgeClass  = theme.badgeClass;
  const signalLabel = SIGNAL_LABEL[brief.signal_type] ?? brief.signal_type;
  const sevClass    = (brief.severity ?? "").toLowerCase();
  const impactLabel = IMPACT_LABEL[brief.impact_type] ?? "Impact";

  async function handleAction() {
    if (actioned || actioning) return;
    setActioning(true);
    try {
      await actionBrief(brief.id, "Actioned via Today's Brief");
      onAction(brief.id);
    } catch (err) {
      console.error("Failed to action brief:", err);
    } finally {
      setActioning(false);
    }
  }

  return (
    <article className={`card ${color}${actioned ? " actioned" : ""}`}>
      <div className="card-inner">

        {/* ── Top row: client info + impact ── */}
        <div className="card-top">
          <div className="client-block">
            <div className="client-line">
              <span className="client-name">{brief.client_name}</span>
              {brief.industry && <span className="industry">{brief.industry}</span>}
            </div>
            <div className="badges">
              <span className={`badge ${badgeClass}`}>
                <span className="sigil" />
                {signalLabel}
              </span>
              <span className={`badge sev ${sevClass}`}>
                <span className="sigil" />
                {brief.severity ?? "—"}
              </span>
            </div>
          </div>

          <div className="impact">
            <div className="impact-label">{impactLabel}</div>
            <div className="impact-value">{formatDollars(brief.dollar_impact)}</div>
          </div>
        </div>

        {/* ── Brief text ── */}
        <p className="brief">{brief.brief_text}</p>

        {/* ── Recommended action ── */}
        <div className="action">
          <div className="ico-wrap">
            <ActionIcon signalType={brief.signal_type} />
          </div>
          <div className="action-body">
            <div className="action-label">Recommended action</div>
            <div className="action-text">{brief.recommended_action}</div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="card-foot">
          <div className="foot-meta">
            <span>Impact <strong>{formatDollars(brief.dollar_impact)}</strong></span>
          </div>
          <div className="foot-actions">
            <Link className="btn" to={`/rm/client/${brief.client_id}`}>
              View Client
            </Link>
            <button
              className="btn primary"
              onClick={handleAction}
              disabled={actioned || actioning}
            >
              <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6.5l2.5 2.5L10 3" />
              </svg>
              {actioned ? "Actioned" : actioning ? "Saving…" : "Mark as Actioned"}
            </button>
          </div>
        </div>

      </div>
    </article>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TodaysBrief() {
  const { user } = useAuth();
  const [briefs, setBriefs]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [running, setRunning]       = useState(false);
  const [actionedIds, setActionedIds] = useState(new Set());

  async function fetchBriefs() {
    setLoading(true);
    setError(null);
    try {
      const data = await getTodaysBriefs();
      setBriefs(data.briefs ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchBriefs(); }, []);

  async function handleRunPipeline() {
    if (running) return;
    setRunning(true);
    try {
      await runPipeline();
      await fetchBriefs();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  function handleAction(briefId) {
    setActionedIds((prev) => new Set([...prev, briefId]));
  }

  const { counts, totalImpact } = computeSummary(briefs);
  const pendingCount = briefs.filter((b) => !actionedIds.has(b.id)).length;

  return (
    <div className="app">

      <Sidebar activePage="brief" badge={{ brief: pendingCount }} />

      {/* ── Main ── */}
      <main className="main">

        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-crumb">
            <span>Workspace</span>
            <span className="sep">/</span>
            <span className="cur">Today's Brief</span>
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
                <div className="user-role">Senior RM · {user?.id ?? "—"}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="content">

          {/* Header */}
          <div className="header">
            <div>
              <div className="greet-date">
                <span>{todayLabel()}</span>
              </div>
              <h1 className="greet-title">Good morning.</h1>
              <p className="greet-sub">
                <span className="num">{briefs.length} accounts</span> flagged today.
              </p>
            </div>
          </div>

          {/* Summary strip */}
          <div className="summary">
            <div className="summary-cell">
              <div className="summary-label">
                <span className="swatch" style={{ background: "var(--red)" }} />
                Credit Stress
              </div>
              <div className="summary-value">
                {counts.credit_stress}
                <span className="unit"> account{counts.credit_stress !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">
                <span className="swatch" style={{ background: "var(--amber)" }} />
                Churn Risk
              </div>
              <div className="summary-value">
                {counts.churn_risk}
                <span className="unit"> account{counts.churn_risk !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">
                <span className="swatch" style={{ background: "var(--green)" }} />
                Upsell
              </div>
              <div className="summary-value">
                {counts.upsell_opportunity}
                <span className="unit"> opportunit{counts.upsell_opportunity !== 1 ? "ies" : "y"}</span>
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">
                <span className="swatch" style={{ background: "var(--text-3)" }} />
                Net Impact
              </div>
              <div className="summary-value">
                {formatDollars(totalImpact)}
                <span className="unit"> at stake</span>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <h2>Prioritized queue</h2>
            <span className="count-chip">{briefs.length}</span>
          </div>

          {/* Card list */}
          {loading && (
            <div className="state-box">
              <div className="spinner" />
              <div className="state-title">Loading briefs…</div>
            </div>
          )}

          {!loading && error && (
            <div className="state-box">
              <div className="state-title">Failed to load briefs</div>
              <div>{error}</div>
              <button className="btn" onClick={fetchBriefs}>Retry</button>
            </div>
          )}

          {!loading && !error && briefs.length === 0 && (
            <div className="state-box">
              <div className="state-title">No briefs for today</div>
              <div>Run the pipeline to generate new briefs.</div>
            </div>
          )}

          {!loading && !error && briefs.length > 0 && (
            <div className="cards">
              {briefs.map((brief) => (
                <BriefCard
                  key={brief.id}
                  brief={brief}
                  actioned={actionedIds.has(brief.id)}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}

          {/* End of queue footer */}
          {!loading && briefs.length > 0 && (
            <div style={{ marginTop: 28, fontSize: 12, color: "var(--text-4)", fontFamily: "'JetBrains Mono', monospace", display: "flex", gap: 10, alignItems: "center" }}>
              <span>End of queue</span>
              <span style={{ flex: 1, height: 1, background: "var(--line-1)" }} />
              <span>Next pipeline run scheduled at 06:30 UTC</span>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
