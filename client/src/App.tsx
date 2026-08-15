import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Solo from './pages/Solo'
import History from './pages/History'
import Leaderboard from './pages/Leaderboard'
import Puzzles from './pages/Puzzles'
import Vision from './pages/Vision'
import BlindChess from './pages/BlindChess'
import Cycles from './pages/Cycles'
import Openings from './pages/Openings'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Dashboard />} />
        <Route path="/cycles" element={<Cycles />} />
        <Route path="/solo" element={<Solo />} />
        <Route path="/history" element={<History />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/puzzles" element={<Puzzles />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/vision" element={<Vision />} />
        <Route path="/blind" element={<BlindChess />} />
        <Route path="/openings" element={<Openings />} />
      </Routes>
    </AuthProvider>
  )
}
