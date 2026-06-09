import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [view, setView] = useState<'menu' | 'join' | 'create'>('menu')
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const nick = nickname.trim()
    const code = roomCode.trim().toUpperCase()
    if (!nick || !code) return setError('Completa todos los campos')
    navigate(`/room/${code}?nickname=${encodeURIComponent(nick)}`)
  }

  function handleSolo() {
    const nick = nickname.trim()
    if (!nick) return setError('Ingresa tu nickname')
    navigate(`/solo?nickname=${encodeURIComponent(nick)}`)
  }

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-12 text-center animate-slide-up">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-8 h-8 flex flex-col justify-center items-center gap-0.5">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-amber rounded-sm"
                style={{
                  width: `${8 + i * 4}px`,
                  height: '4px',
                  opacity: 1 - i * 0.15,
                }}
              />
            ))}
          </div>
          <h1 className="text-4xl font-mono font-bold text-bone tracking-tight">
            WOODPECKER
          </h1>
        </div>
        <p className="text-bone-3 font-mono text-sm tracking-widest uppercase">
          Entrenamiento táctico por repetición
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-void-2 border border-void-4 rounded-sm">
        {view === 'menu' && (
          <div className="p-6 space-y-3 animate-slide-up">
            <button
              onClick={() => setView('join')}
              className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm"
            >
              Unirse a sala
            </button>
            <button
              onClick={() => setView('create')}
              className="w-full py-4 bg-void-3 text-bone font-mono font-semibold text-sm tracking-widest uppercase hover:bg-void-4 transition-colors border border-void-4 rounded-sm"
            >
              Crear sala
            </button>
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-void-4" />
              <span className="text-bone-3 font-mono text-xs">o</span>
              <div className="flex-1 h-px bg-void-4" />
            </div>
            <button
              onClick={() => setView('join')}
              className="w-full py-3 text-bone-3 font-mono text-sm hover:text-bone transition-colors"
              onClickCapture={() => {
                setView('menu')
                navigate('/solo-select')
              }}
            >
              Práctica individual →
            </button>
          </div>
        )}

        {view === 'join' && (
          <form onSubmit={handleJoin} className="p-6 space-y-4 animate-slide-up">
            <button
              type="button"
              onClick={() => { setView('menu'); setError('') }}
              className="text-bone-3 font-mono text-xs hover:text-bone transition-colors"
            >
              ← Volver
            </button>
            <div>
              <label className="block text-bone-3 font-mono text-xs uppercase tracking-widest mb-2">
                Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={20}
                placeholder="TuNombre"
                className="w-full bg-void-3 border border-void-4 text-bone font-mono text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-amber transition-colors placeholder:text-bone-3"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-bone-3 font-mono text-xs uppercase tracking-widest mb-2">
                Código de sala
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="AB7K9"
                className="w-full bg-void-3 border border-void-4 text-amber font-mono font-bold text-xl px-4 py-3 rounded-sm focus:outline-none focus:border-amber transition-colors placeholder:text-void-4 tracking-widest"
              />
            </div>
            {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
            <button
              type="submit"
              className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm"
            >
              Entrar
            </button>
          </form>
        )}

        {view === 'create' && (
          <div className="p-6 space-y-4 animate-slide-up">
            <button
              type="button"
              onClick={() => { setView('menu'); setError('') }}
              className="text-bone-3 font-mono text-xs hover:text-bone transition-colors"
            >
              ← Volver
            </button>
            <div>
              <label className="block text-bone-3 font-mono text-xs uppercase tracking-widest mb-2">
                Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={20}
                placeholder="TuNombre"
                className="w-full bg-void-3 border border-void-4 text-bone font-mono text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-amber transition-colors placeholder:text-bone-3"
                autoFocus
              />
            </div>
            {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
            <button
              onClick={() => {
                const nick = nickname.trim()
                if (!nick) return setError('Ingresa tu nickname')
                navigate(`/create?nickname=${encodeURIComponent(nick)}`)
              }}
              className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm"
            >
              Continuar
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="mt-8 text-bone-3 font-mono text-xs opacity-40">
        Método Woodpecker — repetición como entrenamiento
      </p>
    </div>
  )
}
