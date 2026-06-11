'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSessionId, savePlayerId, savePlayerName, getPlayerName } from '@/lib/session'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Home() {
  const router = useRouter()
  const [name, setName]       = useState('')
  const [code, setCode]       = useState('')
  const [mode, setMode]       = useState<'home' | 'join'>('home')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => { setName(getPlayerName()) }, [])

  async function createRoom() {
    if (!name.trim()) { setError('Ingresa tu nombre'); return }
    setLoading(true); setError('')

    const sessionId = getSessionId()
    let roomCode = generateCode()
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase.from('rooms').select('id').eq('code', roomCode).maybeSingle()
      if (!data) break
      roomCode = generateCode()
    }

    const { data: room, error: e1 } = await supabase
      .from('rooms').insert({ code: roomCode, host_session_id: sessionId }).select().single()
    if (e1) { setError('Error al crear la sala.'); setLoading(false); return }

    const { data: player, error: e2 } = await supabase
      .from('players').insert({ room_id: room.id, name: name.trim(), session_id: sessionId }).select().single()
    if (e2) { setError('Error al unirse.'); setLoading(false); return }

    savePlayerId(roomCode, player.id); savePlayerName(name.trim())
    router.push(`/room/${roomCode}`)
  }

  async function joinRoom() {
    if (!name.trim()) { setError('Ingresa tu nombre'); return }
    const upperCode = code.trim().toUpperCase()
    if (upperCode.length !== 6) { setError('El código debe tener 6 caracteres'); return }
    setLoading(true); setError('')

    const sessionId = getSessionId()
    const { data: room, error: e1 } = await supabase.from('rooms').select().eq('code', upperCode).single()
    if (e1 || !room) { setError('Sala no encontrada.'); setLoading(false); return }
    if (room.status !== 'waiting') { setError('El juego ya comenzó.'); setLoading(false); return }

    const { data: existing } = await supabase.from('players').select().eq('room_id', room.id).eq('session_id', sessionId).maybeSingle()
    if (existing) {
      savePlayerId(upperCode, existing.id); savePlayerName(name.trim())
      router.push(`/room/${upperCode}`); return
    }

    const { data: player, error: e2 } = await supabase
      .from('players').insert({ room_id: room.id, name: name.trim(), session_id: sessionId }).select().single()
    if (e2) { setError('No se pudo unir. Inténtalo de nuevo.'); setLoading(false); return }

    savePlayerId(upperCode, player.id); savePlayerName(name.trim())
    router.push(`/room/${upperCode}`)
  }

  return (
    <main className="min-h-dvh bg-zinc-950 relative overflow-hidden flex flex-col items-center justify-center p-5">

      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-pink-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-violet-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-xs space-y-8 animate-fade-up">

        {/* Logo */}
        <div className="text-center space-y-2">
          <h1 className="text-7xl font-black tracking-tight leading-none select-none
            bg-gradient-to-br from-white via-pink-200 to-pink-500 bg-clip-text text-transparent">
            EXPOSED
          </h1>
          <p className="text-2xl font-black tracking-[0.35em] text-pink-500/80">VDR</p>
          <p className="text-zinc-600 text-sm pt-1">¿Quién será el EXPUESTO?</p>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">👤</span>
            <input type="text" placeholder="Tu nombre" value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && (mode === 'home' ? createRoom() : joinRoom())}
              maxLength={20}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-10 pr-4 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-pink-500/60 transition-colors text-sm" />
          </div>

          {mode === 'join' && (
            <input type="text" placeholder="CÓDIGO" value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
              maxLength={6}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 text-white placeholder-zinc-600 text-center text-2xl font-black tracking-[0.4em] focus:outline-none focus:border-pink-500/60 transition-colors animate-fade-up" />
          )}

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          {mode === 'home' ? (
            <div className="space-y-2.5 pt-1">
              <button onClick={createRoom} disabled={loading}
                className="w-full bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-90 active:scale-[0.98] text-white font-black py-4 rounded-2xl transition-all disabled:opacity-50 text-base shadow-lg shadow-pink-900/30">
                {loading ? 'Creando...' : 'Crear Sala'}
              </button>
              <button onClick={() => { setMode('join'); setError('') }}
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 active:scale-[0.98] text-white font-bold py-4 rounded-2xl transition-all text-sm">
                Unirse a una Sala
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1">
              <button onClick={joinRoom} disabled={loading}
                className="w-full bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-90 active:scale-[0.98] text-white font-black py-4 rounded-2xl transition-all disabled:opacity-50 text-base shadow-lg shadow-pink-900/30">
                {loading ? 'Uniéndose...' : 'Unirse'}
              </button>
              <button onClick={() => { setMode('home'); setCode(''); setError('') }}
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 active:scale-[0.98] text-zinc-500 font-bold py-4 rounded-2xl transition-all text-sm">
                ← Volver
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-zinc-800 text-xs">Para grupos de 3 a 10 personas</p>
      </div>
    </main>
  )
}
