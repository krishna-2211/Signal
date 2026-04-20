import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Landing from './pages/Landing'
import Login from './pages/Login'
import TodaysBrief from './pages/rm/TodaysBrief'
import MyPortfolio from './pages/rm/MyPortfolio'
import ClientDetail from './pages/rm/ClientDetail'
import RiskDashboard from './pages/risk/RiskDashboard'
import EscalationQueue from './pages/risk/EscalationQueue'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/rm/brief" element={<TodaysBrief />} />
        <Route path="/rm/portfolio" element={<MyPortfolio />} />
        <Route path="/rm/client/:client_id" element={<ClientDetail />} />
        <Route path="/risk/dashboard" element={<RiskDashboard />} />
        <Route path="/risk/escalations" element={<EscalationQueue />} />
      </Routes>
    </BrowserRouter>
  )
}
