import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV_ITEMS = [
  { path: '/home', label: 'Home', icon: '🏠' },
  { path: '/endings', label: 'Finales', icon: '♚' },
]

export default function Endings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState<'teoria' | 'practica'>('teoria')
  const [chapters, setChapters] = useState<{ title: string; pgn: string }[]>([])
  const [practicePgn, setPracticePgn] = useState('')
  const [practiceChapters, setPracticeChapters] = useState<{ title: string; pgn: string }[]>([])

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetch('/endings.pgn').then(r => r.text()).then(text => {
      const parts = text.replace(/\r\n/g, '\n').split(/(?=\[Event )/).map(s => s.trim()).filter(Boolean)
      setChapters(parts.map(p => {
        const m = p.match(/\[SourceTitle "([^"]*)"\]/) || p.match(/\[White "([^"]*)"\]/)
        return { title: m ? m[1] : 'Capítulo', pgn: p }
      }))
    })
  }, [user, navigate])

  function parsePractice() {
    const parts = practicePgn.replace(/\r\n/g, '\n').split(/(?=\[Event )/).map(s => s.trim()).filter(Boolean)
    setPracticeChapters(parts.map(p => {
      const m = p.match(/\[SourceTitle "([^"]*)"\]/) || p.match(/\[White "([^"]*)"\]/)
      return { title: m ? m[1] : 'Capítulo', pgn: p }
    }))
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-[#E8E6E0] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">♚ Finales</h1>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('teoria')} className={`px-4 py-2 rounded ${tab === 'teoria' ? 'bg-[#D4A017] text-black' : 'bg-[#1C1C28]'}`}>Teoría</button>
          <button onClick={() => setTab('practica')} className={`px-4 py-2 rounded ${tab === 'practica' ? 'bg-[#D4A017] text-black' : 'bg-[#1C1C28]'}`}>Práctica</button>
        </div>
        {tab === 'teoria' && (
          <div className="space-y-4">
            {chapters.map((c, i) => (
              <details key={i} className="bg-[#12121A] border border-[#1F1F2E] rounded p-4">
                <summary className="cursor-pointer font-semibold">{c.title}</summary>
                <pre className="mt-3 whitespace-pre-wrap text-sm text-[#B8B5AC]">{c.pgn.replace(/\[[^\]]*\]/g, '').trim()}</pre>
              </details>
            ))}
          </div>
        )}
        {tab === 'practica' && (
          <div>
            <textarea value={practicePgn} onChange={e => setPracticePgn(e.target.value)} className="w-full h-40 bg-[#12121A] border border-[#1F1F2E] rounded p-3 text-sm" placeholder="Pega aquí el PGN del workbook" />
            <button onClick={parsePractice} className="mt-2 px-4 py-2 bg-[#D4A017] text-black rounded">Cargar</button>
            <div className="mt-4 space-y-4">
              {practiceChapters.map((c, i) => (
                <details key={i} className="bg-[#12121A] border border-[#1F1F2E] rounded p-4">
                  <summary className="cursor-pointer font-semibold">{c.title}</summary>
                  <pre className="mt-3 whitespace-pre-wrap text-sm text-[#B8B5AC]">{c.pgn.replace(/\[[^\]]*\]/g, '').trim()}</pre>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
