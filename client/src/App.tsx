import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import CreateRoom from './pages/CreateRoom'
import Lobby from './pages/Lobby'
import Race from './pages/Race'
import Results from './pages/Results'
import Solo from './pages/Solo'
import History from './pages/History'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create" element={<CreateRoom />} />
      <Route path="/solo-select" element={<Navigate to="/solo" replace />} />
      <Route path="/solo" element={<Solo />} />
      <Route path="/room/:code" element={<Lobby />} />
      <Route path="/race/:code" element={<Race />} />
      <Route path="/results/:code" element={<Results />} />
      <Route path="/history" element={<History />} />
    </Routes>
  )
}
