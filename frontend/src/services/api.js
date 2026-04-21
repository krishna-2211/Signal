const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "signal_token";

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.replace("/login");
      throw new Error("Session expired");
    }
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const getMe = () => request("/api/auth/me");

// ── Briefs ───────────────────────────────────────────────────────────────────

export const getTodaysBriefs = () => request("/api/briefs/");

export const getLatestBriefs = () => request("/api/briefs/latest");

export const getClientBriefHistory = (clientId) =>
  request(`/api/briefs/${encodeURIComponent(clientId)}`);

export const actionBrief = (briefId, notes) =>
  request(`/api/briefs/${briefId}/action`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });

// ── Clients ──────────────────────────────────────────────────────────────────

export const getClients = () => request("/api/clients/");

export const getClientDetail = (clientId) =>
  request(`/api/clients/${encodeURIComponent(clientId)}`);

// ── Pipeline ─────────────────────────────────────────────────────────────────

export const runPipeline = () =>
  request("/api/pipeline/run", { method: "POST" });

export const getPipelineStatus = () => request("/api/pipeline/status");

// ── Dashboard ────────────────────────────────────────────────────────────────

export const getRiskDashboard = () => request("/api/dashboard/risk");

// ── Audit ────────────────────────────────────────────────────────────────────

export const getAuditLog = (limit = 100) =>
  request(`/api/audit?limit=${limit}`);
