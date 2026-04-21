import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/Sidebar";
import { actionBrief, getClientDetail } from "../../services/api";
import { getSignalColors, getSignalTheme } from "../../utils/signalColors";
import "../../styles/client-detail.css";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function pct(n) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function relDate(iso) {
  if (!iso) return "—";
  const d = daysAgo(iso);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function parseProducts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function parseExternalContext(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// Derive key metrics from raw arrays
function deriveMetrics(data) {
  const { client, balances, payments, logins, transactions } = data;

  // Balance change
  let balanceChange = null;
  let balancePct = null;
  if (balances?.length >= 2) {
    const latest = balances[balances.length - 1]?.balance ?? 0;
    const prev   = balances[0]?.balance ?? 0;
    balanceChange = latest - prev;
    balancePct = prev !== 0 ? ((balanceChange / Math.abs(prev)) * 100) : null;
  }

  // Most recent payment days_late
  const recentPayment = payments?.length ? payments[payments.length - 1] : null;
  const daysLate = recentPayment?.days_late ?? null;

  // Days since last login
  const lastLogin = logins?.[0]?.login_date ?? null;
  const daysSinceLogin = lastLogin ? daysAgo(lastLogin) : null;

  // Loan exposure
  const loanBalance = client?.loan_balance ?? null;
  const creditLimit  = client?.credit_limit ?? null;
  const utilization  = loanBalance && creditLimit
    ? Math.round((loanBalance / creditLimit) * 100)
    : null;

  // Transaction trend
  const vols = (transactions ?? []).map((t) => t.volume);
  const current = vols[0] ?? null;
  const avg12 = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  const wowPct = vols.length >= 2
    ? ((vols[0] - vols[1]) / (vols[1] || 1)) * 100
    : null;

  return { balanceChange, balancePct, daysLate, daysSinceLogin, loanBalance, utilization, creditLimit, current, avg12, wowPct };
}

// ── TransactionChart ───────────────────────────────────────────────────────────

function TransactionChart({ transactions, signalType, colors }) {
  const theme = getSignalTheme(signalType);
  const chartColor = colors?.borderColor ?? theme.hex;

  // transactions are desc; reverse for chronological display
  const weeks = [...(transactions ?? [])].reverse().slice(-12);
  if (!weeks.length) return null;

  const maxVal = Math.max(...weeks.map((w) => w.volume), 1);
  const roundedMax = Math.ceil(maxVal / 250_000) * 250_000;

  const vols = weeks.map((w) => w.volume);
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
  const current = vols[vols.length - 1];
  const prev    = vols[vols.length - 2];
  const wowPct  = prev ? ((current - prev) / Math.abs(prev)) * 100 : null;

  const alertThreshold = avg * 0.7; // flag bars below 70% of avg

  const yLabels = [
    fmt$(roundedMax),
    fmt$(roundedMax * 0.75),
    fmt$(roundedMax * 0.5),
    fmt$(roundedMax * 0.25),
    "$0",
  ];

  return (
    <div className="card chart-card">
      <div className="card-head">
        <span className="accent" style={{ background: chartColor }} />
        <h3>Transaction Volume · Last 12 Weeks</h3>
        <span className="count-chip">Weekly</span>
      </div>

      <div className="chart-head-stats">
        <div className="chart-stat">
          <span className="lbl">Current Week</span>
          <span className={`val${current < avg * 0.8 ? " neg" : ""}`}>{fmt$(current)}</span>
        </div>
        <div className="chart-stat">
          <span className="lbl">12w Avg</span>
          <span className="val">{fmt$(avg)}</span>
        </div>
        {wowPct != null && (
          <div className="chart-stat">
            <span className="lbl">WoW</span>
            <span className={`val${wowPct < 0 ? " neg" : ""}`}>{pct(wowPct)}</span>
          </div>
        )}
      </div>

      <div className="chart-wrap">
        <div className="chart" style={{ "--signal-color": chartColor, "--signal-text": theme.text }}>
          <div className="y-axis">
            {yLabels.map((l) => <span key={l}>{l}</span>)}
          </div>
          <div className="plot">
            <div className="grid-lines">
              <span /><span /><span /><span /><span />
            </div>
            <div className="bars">
              {weeks.map((w, i) => {
                const isCurrent = i === weeks.length - 1;
                const isAlert   = !isCurrent && w.volume < alertThreshold;
                const heightPct = Math.round((w.volume / roundedMax) * 100);
                const label     = `W-${weeks.length - 1 - i}` || "Now";
                return (
                  <div
                    key={w.week_start ?? i}
                    className={`bar-col${isCurrent ? " current" : isAlert ? " alert" : ""}`}
                  >
                    <div className="bar-val">{fmt$(w.volume)}</div>
                    <div
                      className="bar"
                      style={{
                        height: `${heightPct}%`,
                        background: isCurrent
                          ? chartColor
                          : isAlert
                          ? `${chartColor}66`
                          : undefined,
                      }}
                    />
                    <div className="bar-label">{isCurrent ? "Now" : label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="chart-legend">
        <span className="k">
          <span className="sw" style={{ background: "var(--text-4)" }} />
          Weekly volume
        </span>
        <span className="k">
          <span className="sw" style={{ background: chartColor }} />
          Current week
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClientDetail() {
  const { user }       = useAuth();
  const { client_id }  = useParams();
  const navigate       = useNavigate();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Notes
  const [noteText, setNoteText]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const savedTimer = useRef(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await getClientDetail(client_id);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [client_id]);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  async function handleSaveNote() {
    const brief = data?.latest_brief;
    if (!brief || saving || !noteText.trim()) return;

    setSaving(true);
    try {
      await actionBrief(brief.id, noteText.trim());
      setSaved(true);
      setNoteText("");
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
      // Refresh to show updated notes
      fetchData();
    } catch (err) {
      console.error("Failed to save note:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="app">
        <aside className="sidebar"><div className="brand"><div className="brand-mark" /><div className="brand-name">Signal</div></div></aside>
        <main className="main">
          <div className="state-box">
            <div className="spinner" />
            <div className="state-title">Loading client…</div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app">
        <aside className="sidebar"><div className="brand"><div className="brand-mark" /><div className="brand-name">Signal</div></div></aside>
        <main className="main">
          <div className="state-box">
            <div className="state-title">Failed to load client</div>
            <div>{error ?? "Unknown error"}</div>
            <button className="btn" onClick={fetchData}>Retry</button>
            <button className="btn" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </main>
      </div>
    );
  }

  const { client, transactions, payments, balances, logins, product_usage, latest_signal, latest_brief } = data;

  // Brief is the authoritative signal source; fall back to raw signal table
  const signalType = (
    latest_brief?.signal_type ||
    latest_signal?.signal_type ||
    "none"
  ).toLowerCase();
  const severity = latest_brief?.severity || latest_signal?.severity || "NONE";
  const theme    = getSignalTheme(signalType);
  const colors   = getSignalColors(signalType);
  const metrics     = deriveMetrics({ client, balances, payments, logins, transactions });

  const clientInitials  = initials(client.name);
  const products        = parseProducts(client.products);
  const externalContext = parseExternalContext(latest_signal?.external_context);
  const newsHeadlines   = externalContext?.news_headlines ?? [];

  const cssVars = {
    "--signal-color": theme.color,
    "--signal-soft":  theme.soft,
    "--signal-text":  theme.text,
  };

  return (
    <div className="app" style={cssVars}>

      {/* ── Sidebar ── */}
      <Sidebar activePage="portfolio" />

      {/* ── Main ── */}
      <main className="main">

        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-crumb">
            <Link to="/rm/brief">Workspace</Link>
            <span className="sep">/</span>
            <Link to="/rm/portfolio">My Portfolio</Link>
            <span className="sep">/</span>
            <span className="cur">{client.name}</span>
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

          {/* Client header */}
          <div className="client-head">
            <div className="client-logo">{clientInitials}</div>
            <div className="client-info">
              <div className="client-name-row">
                <div className="client-name">{client.name}</div>
                {client.industry && <span className="industry">{client.industry}</span>}
              </div>
              <div className="client-meta">
                <span>{client.id}</span>
                {client.location && <><span className="dot" /><span>{client.location}</span></>}
                {client.loan_origination_date && (
                  <><span className="dot" /><span>Since {new Date(client.loan_origination_date).getFullYear()}</span></>
                )}
              </div>
              {signalType !== "none" && (
                <div className="head-badges">
                  <span
                    className="badge"
                    style={{ background: colors.badgeBg, color: colors.badgeColor, borderColor: colors.borderColor }}
                  >
                    <span className="sigil" style={{ background: colors.badgeColor }} />
                    {colors.label}
                  </span>
                  <span className={`badge sev ${severity.toLowerCase()}`}>
                    <span className="sigil" />{severity.charAt(0) + severity.slice(1).toLowerCase()} Severity
                  </span>
                </div>
              )}
            </div>
            <div className="head-actions">
              <button className="btn" onClick={() => navigate(-1)}>
                <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 2l-5 4 5 4" />
                </svg>
                Back
              </button>
            </div>
          </div>

          {/* Two-column */}
          <div className="cols">

            {/* ── LEFT ── */}
            <div>

              {/* Signal brief */}
              {(latest_brief || latest_signal) && (
                <div
                  className="card brief-card"
                  style={{
                    borderLeft: `3px solid ${colors.borderColor}`,
                    background: colors.background,
                    "--signal-color": colors.borderColor,
                  }}
                >
                  <div className="card-head">
                    <span className="accent" style={{ background: colors.borderColor }} />
                    <h3>Signal Brief</h3>
                    {latest_signal?.run_date && (
                      <span className="count-chip">Detected {relDate(latest_signal.run_date)}</span>
                    )}
                  </div>
                  <div className="card-body">
                    {latest_brief?.brief_text && (
                      <p className="brief-lede">{latest_brief.brief_text}</p>
                    )}

                    {latest_signal?.reasoning && !latest_brief?.brief_text && (
                      <p className="brief-lede">{latest_signal.reasoning}</p>
                    )}

                    {latest_brief?.recommended_action && (
                      <div
                        className="action-box"
                        style={{
                          borderLeft: `2px solid ${colors.borderColor}`,
                          background: colors.badgeBg,
                          color: colors.textColor,
                          "--signal-color": colors.borderColor,
                          "--signal-soft":  colors.background,
                          "--signal-text":  colors.textColor,
                        }}
                      >
                        <div className="ico-wrap">
                          <svg className="ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 1v7M6 11v.01" />
                          </svg>
                        </div>
                        <div>
                          <div className="action-label">Recommended action</div>
                          <div className="action-text">{latest_brief.recommended_action}</div>
                        </div>
                      </div>
                    )}

                    <div className="brief-meta">
                      {latest_signal?.run_date && (
                        <span>Detected <strong>{relDate(latest_signal.run_date)}</strong></span>
                      )}
                      {latest_signal?.score != null && (
                        <span>Confidence <strong>{(latest_signal.score / 100).toFixed(2)}</strong></span>
                      )}
                      {latest_brief?.dollar_impact != null && (
                        <span>Impact <strong>{fmt$(latest_brief.dollar_impact)}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Signal history */}
              <div className="card">
                <div className="card-head">
                  <span className="accent" style={{ background: "var(--text-3)" }} />
                  <h3>Signal History</h3>
                  {latest_signal && <span className="count-chip">Latest detection</span>}
                </div>
                <div className="card-body">
                  {latest_signal ? (
                    <div className="tl">
                      <div className="tl-item" style={{ "--tl-color": colors.borderColor }}>
                        <span className="node" style={{ background: colors.borderColor }} />
                        <div className="tl-row1">
                          <span className="tl-date">
                            {latest_signal.run_date
                              ? new Date(latest_signal.run_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—"}
                          </span>
                          <span
                            className="tl-tag"
                            style={{ background: colors.badgeBg, color: colors.badgeColor }}
                          >
                            {colors.label} · {severity.charAt(0) + severity.slice(1).toLowerCase()}
                          </span>
                        </div>
                        <div className="tl-title" style={{ color: colors.textColor }}>
                          {colors.label} signal detected
                        </div>
                        {latest_signal.reasoning && (
                          <div className="tl-text">{latest_signal.reasoning}</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-3)", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                      No signals detected yet.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ── RIGHT ── */}
            <div>

              {/* Key metrics */}
              <div className="card">
                <div className="card-head">
                  <span className="accent" style={{ background: colors.borderColor }} />
                  <h3>Key Metrics</h3>
                  <div className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--text-3)" }}>
                    Current period
                  </div>
                </div>
                <div className="metrics-grid">
                  <div className="metric-cell">
                    <div className="lbl">Balance Change</div>
                    <div className={`val${metrics.balanceChange != null && metrics.balanceChange < 0 ? " neg" : ""}`}>
                      {fmt$(metrics.balanceChange)}
                    </div>
                    {metrics.balancePct != null && (
                      <div className="sub">
                        <span className={metrics.balancePct < 0 ? "delta-up" : "delta-down"}>
                          {pct(metrics.balancePct)}
                        </span>
                        {" "}vs. prior period
                      </div>
                    )}
                  </div>

                  <div className="metric-cell">
                    <div className="lbl">Days Late</div>
                    <div className={`val${metrics.daysLate > 10 ? " warn" : ""}`}>
                      {metrics.daysLate ?? "—"}
                    </div>
                    <div className="sub">Most recent payment</div>
                  </div>

                  <div className="metric-cell">
                    <div className="lbl">Days Since Login</div>
                    <div className={`val${metrics.daysSinceLogin > 30 ? " warn" : ""}`}>
                      {metrics.daysSinceLogin ?? "—"}
                    </div>
                    <div className="sub">Online banking portal</div>
                  </div>

                  <div className="metric-cell">
                    <div className="lbl">Loan Balance</div>
                    <div className="val">{fmt$(metrics.loanBalance)}</div>
                    {metrics.utilization != null && (
                      <div className="sub">{metrics.utilization}% utilized</div>
                    )}
                  </div>
                </div>
              </div>

              {/* External news */}
              {newsHeadlines.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <span className="accent" style={{ background: "var(--amber)" }} />
                    <h3>External Headlines</h3>
                    <span className="count-chip">NewsAPI · {newsHeadlines.length}</span>
                  </div>
                  <div className="news-list">
                    {newsHeadlines.map((article, i) => (
                      <div className="news-item" key={i}>
                        <div className="news-source">
                          <span className="logo">
                            {(article.source ?? "?").slice(0, 2).toUpperCase()}
                          </span>
                          {article.source ?? "News"}
                        </div>
                        <div className="news-time">{relDate(article.published_at)}</div>
                        <div className="news-title">{article.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {products.length > 0 && (
                <div className="card">
                  <div className="card-head">
                    <span className="accent" style={{ background: "var(--green)" }} />
                    <h3>Products Held</h3>
                    <span className="count-chip">{products.length}</span>
                  </div>
                  <div className="products">
                    {products.map((p, i) => (
                      <span key={i} className="product-tag active">
                        <span className="dot" />
                        {p}
                      </span>
                    ))}
                  </div>
                  {product_usage?.length > 0 && (
                    <div className="products-foot">
                      {product_usage.length} product{product_usage.length !== 1 ? "s" : ""} tracked
                      {client.annual_revenue && (
                        <> · Annual revenue est. <strong>{fmt$(client.annual_revenue)}</strong></>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="card">
                <div className="card-head">
                  <span className="accent" style={{ background: "var(--text-3)" }} />
                  <h3>RM Notes</h3>
                </div>
                <div className="notes-area">
                  <textarea
                    className="notes-input"
                    placeholder="Add a note about this signal or your conversation with the client…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <div className="notes-foot">
                    <button
                      className="btn primary"
                      onClick={handleSaveNote}
                      disabled={saving || !noteText.trim() || !latest_brief?.id}
                    >
                      {saving ? "Saving…" : "Save note"}
                    </button>
                    {!latest_brief?.id && (
                      <span className="notes-meta">No active brief to attach note to</span>
                    )}
                    {saved && (
                      <span className="notes-meta saved">Saved ✓</span>
                    )}
                  </div>
                </div>

                {latest_brief?.notes && (
                  <div className="note-history">
                    <div className="note">
                      <div className="note-head">
                        <span className="who">{client.rm_name ?? "RM"}</span>
                        <span>{relDate(latest_brief.actioned_at ?? latest_brief.created_at)}</span>
                      </div>
                      <div className="note-body">{latest_brief.notes}</div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Transaction chart */}
          {transactions?.length > 0 && (
            <TransactionChart transactions={transactions} signalType={signalType} colors={colors} />
          )}

        </section>
      </main>
    </div>
  );
}
