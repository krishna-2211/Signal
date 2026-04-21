import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'

import { AuthProvider, useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import AuditLog from './pages/AuditLog'
import TodaysBrief from './pages/rm/TodaysBrief'
import MyPortfolio from './pages/rm/MyPortfolio'
import ClientDetail from './pages/rm/ClientDetail'
import RiskDashboard from './pages/risk/RiskDashboard'
import EscalationQueue from './pages/risk/EscalationQueue'

function ProtectedRoute({ role, children }) {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0b0d10",
        display: "grid", placeItems: "center",
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          border: "2px solid #1f242c", borderTopColor: "#6b7482",
          animation: "spin 0.7s linear infinite",
        }} />
      </div>
    );
  }

  if (!token || !user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          <Route path="/rm/brief"    element={<ProtectedRoute role="rm"><TodaysBrief /></ProtectedRoute>} />
          <Route path="/rm/portfolio" element={<ProtectedRoute role="rm"><MyPortfolio /></ProtectedRoute>} />
          <Route path="/rm/client/:client_id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />

          <Route path="/risk/dashboard"   element={<ProtectedRoute role="risk"><RiskDashboard /></ProtectedRoute>} />
          <Route path="/risk/escalations" element={<ProtectedRoute role="risk"><EscalationQueue /></ProtectedRoute>} />

          <Route path="/audit" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
