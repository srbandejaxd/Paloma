import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getSocket } from '../lib/socket'
import { Room, Player } from '../types'

export default function Lobby() {
  const { code } = useParams<{ code: string }>()
  const [params] = useSearchParams()
  const nickname = params.get('nickname') || 'Anon'
  const isHost = params.get('host') === '1'
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const socket = getSocket()
    if (!isHost) {
        socket.emit('join_room', { code, nickname })
    }

    socket.on('room_state', (roomData: Room) => setRoom(roomData))

    socket.on('player_joined', (player: Player) => {
      setRoom(prev => {
        if (!prev) return prev
        if (prev.players.find(p => p.id === player.id)) return prev
        return { ...prev, players: [...prev.players, player] }
      })
    })

    socket.on('player_left', (playerId: string) => {
      setRoom(prev =>
        prev ? { ...prev, players: prev.players.filter(p => p.id !== playerId) } : prev
      )
    })

    socket.on('race_starting', () => {
      navigate(`/race/${code}?nickname=${encodeURIComponent(nickname)}`)
    })

    socket.on('join_error', (msg: string) => setError(msg))

    return () => {
      socket.off('room_state')
      socket.off('player_joined')
      socket.off('player_left')
      socket.off('race_starting')
      socket.off('join_error')
    }
  }, [code, nickname, navigate])

  function startRace() {
    getSocket().emit('start_race', { code })
  }

  function copyLink() {
    // Copia el link completo para compartir
    const url = `${window.location.origin}/room/${code}?nickname=Invitado`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 font-mono mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="text-bone-3 font-mono text-sm hover:text-bone">
            ← Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <p className="text-bone-3 font-mono animate-pulse-amber">Conectando...</p>
      </div>
    )
  }

  const timeLimitLabel = room.timeLimit
    ? `${room.timeLimit % 60 === 0 ? room.timeLimit / 60 + ' min' : (room.timeLimit / 60).toFixed(1) + ' min'}`
    : null

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Código de sala */}
        <div className="text-center mb-8 animate-slide-up">
          <p className="text-bone-3 font-mono text-xs uppercase tracking-widest mb-3">Código de sala</p>
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-void-2 border border-amber/30 rounded-sm">
            <span className="text-5xl font-mono font-bold text-amber tracking-widest">{room.code}</span>
          </div>
          <div className="mt-3 text-bone-3 font-mono text-xs">
            {room.totalPuzzles} ejercicios
            {timeLimitLabel && <> · <span className="text-amber">{timeLimitLabel}</span></>}
          </div>
          {/* Botón para copiar link completo */}
          <button
            onClick={copyLink}
            className="mt-3 text-bone-3 font-mono text-xs hover:text-bone underline transition-colors"
          >
            {copied ? '✓ Link copiado' : 'Copiar link de invitación'}
          </button>
        </div>

        {/* Jugadores */}
        <div className="bg-void-2 border border-void-4 rounded-sm mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-void-4">
            <span className="text-bone-3 font-mono text-xs uppercase tracking-widest">Jugadores</span>
            <span className="text-bone-3 font-mono text-xs">
              {room.players.length} conectado{room.players.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-void-4">
            {room.players.map((player, i) => (
              <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-amber' : 'bg-void-4'}`} />
                <span className="font-mono text-sm text-bone">{player.nickname}</span>
                {player.id === room.hostId && (
                  <span className="ml-auto text-amber font-mono text-xs">anfitrión</span>
                )}
                {player.nickname === nickname && player.id !== room.hostId && (
                  <span className="ml-auto text-bone-3 font-mono text-xs">tú</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Botón de inicio — solo host */}
        {isHost ? (
          <button
            onClick={startRace}
            disabled={room.players.length < 1}
            className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm disabled:opacity-40"
          >
            Iniciar carrera →
          </button>
        ) : (
          <div className="text-center py-4">
            <p className="text-bone-3 font-mono text-sm animate-pulse-amber">
              Esperando al anfitrión...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
