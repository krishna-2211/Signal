const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

// ── Briefs ───────────────────────────────────────────────────────────────────

export const getTodaysBriefs = (rmId) =>
  request(`/api/briefs?rm_id=${encodeURIComponent(rmId)}`);

export const getLatestBriefs = (rmId) =>
  request(`/api/briefs/latest?rm_id=${encodeURIComponent(rmId)}`);

export const getClientBriefHistory = (clientId) =>
  request(`/api/briefs/${encodeURIComponent(clientId)}`);

export const actionBrief = (briefId, notes) =>
  request(`/api/briefs/${briefId}/action`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });

// ── Clients ──────────────────────────────────────────────────────────────────

export const getClients = (rmId) =>
  request(`/api/clients?rm_id=${encodeURIComponent(rmId)}`);

export const getClientDetail = (clientId) =>
  request(`/api/clients/${encodeURIComponent(clientId)}`);

// ── Pipeline ─────────────────────────────────────────────────────────────────

export const runPipeline = (rmId) =>
  request(`/api/pipeline/run${rmId ? `?rm_id=${encodeURIComponent(rmId)}` : ""}`, {
    method: "POST",
  });

export const getPipelineStatus = () => request("/api/pipeline/status");

// ── Dashboard ────────────────────────────────────────────────────────────────

export const getRiskDashboard = () => request("/api/dashboard/risk");

// ── Audit ────────────────────────────────────────────────────────────────────

export const getAuditLog = (limit = 100) =>
  request(`/api/audit?limit=${limit}`);
