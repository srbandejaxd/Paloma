import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { register, loginApi } from '../lib/api'
import { useAuth } from '../lib/auth'

type Mode = 'login' | 'register'

export default function Home() {
  const [mode, setMode] = useState<Mode>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit() {
    setError('')
    if (!nickname.trim() || !password.trim()) { setError('Completa todos los campos'); return }
    setLoading(true)
    try {
      const data = mode === 'register'
        ? await register(nickname.trim(), password)
        : await loginApi(nickname.trim(), password)
      login(data.nickname, data.token)
      navigate('/solo')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">🪃</div>
          <h1 className="text-3xl font-mono font-bold text-bone tracking-tight">Woodpecker</h1>
          <p className="text-bone-3 font-mono text-sm mt-2">Entrenamiento táctico por repetición</p>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 bg-void-2 border border-void-4 rounded-sm p-1">
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest rounded-sm transition-all ${
                mode === m ? 'bg-amber text-void font-bold' : 'text-bone-3 hover:text-bone'
              }`}
            >
              {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="space-y-3">
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Nickname"
            autoComplete="username"
            className="w-full bg-void-2 border border-void-4 text-bone font-mono text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-amber transition-colors placeholder:text-bone-3"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            className="w-full bg-void-2 border border-void-4 text-bone font-mono text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-amber transition-colors placeholder:text-bone-3"
          />

          {error && (
            <p className="text-red-400 font-mono text-xs px-1">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm disabled:opacity-50"
          >
            {loading ? 'Cargando...' : mode === 'login' ? 'Entrar →' : 'Crear cuenta →'}
          </button>
        </div>
      </div>
    </div>
  )
}
