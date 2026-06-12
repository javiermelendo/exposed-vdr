'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSessionId, getPlayerId, savePlayerId, savePlayerName } from '@/lib/session'
import type { Room, Player, Vote } from '@/lib/types'
import { QUESTIONS_BY_MODE, GAME_MODES, getConsequence, type GameMode } from '@/lib/questions'

const AVATAR_COLORS = [
  'bg-pink-500', 'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-red-500', 'bg-orange-500', 'bg-teal-500',
  'bg-indigo-500', 'bg-rose-400',
]

function Avatar({ name, index, size = 'md' }: { name: string; index: number; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sz = size === 'xl'  ? 'w-24 h-24 text-4xl'
           : size === 'lg'  ? 'w-16 h-16 text-2xl'
           : size === 'sm'  ? 'w-9 h-9 text-sm'
           : 'w-12 h-12 text-lg'
  return (
    <div className={`${sz} ${AVATAR_COLORS[index % AVATAR_COLORS.length]} rounded-full flex items-center justify-center font-black text-white flex-shrink-0 shadow-lg`}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoomPage() {
  const params = useParams<{ code: string }>()
  const code = (params.code as string).toUpperCase()
  const router = useRouter()

  const [room, setRoom]         = useState<Room | null>(null)
  const [roomId, setRoomId]     = useState<string | null>(null)
  const [players, setPlayers]   = useState<Player[]>([])
  const [votes, setVotes]       = useState<Vote[]>([])
  const [myPlayer, setMyPlayer] = useState<Player | null>(null)
  const [loading, setLoading]   = useState(true)

  const [needsJoin, setNeedsJoin] = useState(false)
  const [joinName, setJoinName]   = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining]     = useState(false)

  const [manualName, setManualName]     = useState('')
  const [addingManual, setAddingManual] = useState(false)

  const [selectedMode, setSelectedMode] = useState<GameMode>('principiante')

  const [startingGame, setStartingGame] = useState(false)

  const [revealStep, setRevealStep] = useState(0)
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const sessionId = getSessionId()
  const isHost    = !!room && room.host_session_id === sessionId

  const mode         = selectedMode
  const questionPack = room?.ai_questions?.length
    ? room.ai_questions
    : (QUESTIONS_BY_MODE[mode] ?? QUESTIONS_BY_MODE.principiante)
  const currentQ     = room ? questionPack[room.current_question_index % questionPack.length] : null
  const modeConfig   = GAME_MODES.find(m => m.id === mode) ?? GAME_MODES[0]

  const roundVotes = votes.filter(v => v.round === room?.current_question_index)
  const myVote     = roundVotes.find(v => v.voter_id === myPlayer?.id)

  const connectedPlayers  = players.filter(p => !p.is_manual)
  const allConnectedVoted = connectedPlayers.length >= 2 &&
    connectedPlayers.every(p => roundVotes.some(v => v.voter_id === p.id))

  const voteCounts: Record<string, number> = {}
  for (const p of players) voteCounts[p.id] = roundVotes.filter(v => v.voted_for_id === p.id).length

  // ── Empate: todos los jugadores con el máximo de votos ────────────────────
  const maxVotes   = players.length > 0 ? Math.max(0, ...players.map(p => voteCounts[p.id] ?? 0)) : 0
  const tiedPlayers = maxVotes > 0 ? players.filter(p => (voteCounts[p.id] ?? 0) === maxVotes) : []

  // ── Load & subscriptions ─────────────────────────────────────────────────

  const loadPlayers = useCallback(async (id: string) => {
    const { data } = await supabase.from('players').select().eq('room_id', id).order('created_at')
    if (data) setPlayers(data)
  }, [])

  const triggerReveal = useCallback(() => {
    revealTimers.current.forEach(clearTimeout)
    revealTimers.current = []
    setRevealStep(0)
    revealTimers.current.push(setTimeout(() => setRevealStep(1), 2800))
    revealTimers.current.push(setTimeout(() => setRevealStep(2), 4800))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: roomData } = await supabase.from('rooms').select().eq('code', code).single()
      if (cancelled) return
      if (!roomData) { router.push('/'); return }

      setRoom(roomData)
      setRoomId(roomData.id)
      if (roomData.mode) setSelectedMode(roomData.mode as GameMode)
      await loadPlayers(roomData.id)

      const { data: votesData } = await supabase.from('votes').select().eq('room_id', roomData.id)
      if (cancelled) return
      if (votesData) setVotes(votesData)

      const playerId = getPlayerId(code)
      if (playerId) {
        const { data: me } = await supabase.from('players').select().eq('id', playerId).single()
        if (cancelled) return
        if (me) setMyPlayer(me)
        else if (roomData.status === 'waiting') setNeedsJoin(true)
      } else if (roomData.status === 'waiting') {
        setNeedsJoin(true)
      }

      if (roomData.status === 'revealing') triggerReveal()
      setLoading(false)
    }
    init()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  useEffect(() => {
    if (!roomId) return
    const channel = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        payload => {
          const r = payload.new as Room
          setRoom(r)
          if (r.mode) setSelectedMode(r.mode as GameMode)
          if (r.status === 'revealing') triggerReveal()
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => loadPlayers(roomId)
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` },
        payload => setVotes(prev => [...prev, payload.new as Vote])
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useEffect(() => {
    if (!isHost || !allConnectedVoted || room?.status !== 'playing') return
    const t = setTimeout(() => revealRound(), 1200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allConnectedVoted, isHost, room?.status])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function joinAsPlayer() {
    if (!joinName.trim()) { setJoinError('Ingresa tu nombre'); return }
    setJoining(true); setJoinError('')
    const { data: player, error } = await supabase
      .from('players').insert({ room_id: room!.id, name: joinName.trim(), session_id: sessionId }).select().single()
    if (error) { setJoinError('Error al unirse.'); setJoining(false); return }
    savePlayerId(code, player.id); savePlayerName(joinName.trim())
    setMyPlayer(player); setNeedsJoin(false); setJoining(false)
  }

  async function addManualPlayer() {
    if (!manualName.trim()) return
    setAddingManual(true)
    await supabase.from('players').insert({ room_id: room!.id, name: manualName.trim(), is_manual: true })
    setManualName(''); setAddingManual(false)
  }

  async function removePlayer(id: string) {
    await supabase.from('players').delete().eq('id', id)
  }

  function selectMode(m: GameMode) { setSelectedMode(m) }

  async function startGame() {
    setStartingGame(true)
    let aiQuestions: string[] | null = null
    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerNames: players.map(p => p.name), mode: selectedMode }),
      })
      const data = await res.json()
      console.log('[AI] response status:', res.status, data)
      if (res.ok && Array.isArray(data.questions) && data.questions.length > 0) {
        aiQuestions = data.questions
      }
    } catch (err) {
      console.error('[AI] fetch error:', err)
    }
    await supabase.from('rooms').update({
      status: 'playing',
      current_question_index: 0,
      mode: selectedMode,
      ...(aiQuestions ? { ai_questions: aiQuestions, total_questions: aiQuestions.length } : {}),
    }).eq('id', room!.id)
    setStartingGame(false)
  }

  async function castVote(votedForId: string) {
    if (!myPlayer || myVote) return
    await supabase.from('votes').insert({
      room_id: room!.id, round: room!.current_question_index,
      voter_id: myPlayer.id, voted_for_id: votedForId,
    })
  }

  async function revealRound() {
    if (!room || tiedPlayers.length === 0) return
    await supabase.from('rooms').update({ status: 'revealing' }).eq('id', room.id)
    // Sumar 1 punto a todos los jugadores empatados
    for (const p of tiedPlayers) {
      await supabase.from('players').update({ score: p.score + 1 }).eq('id', p.id)
    }
  }

  async function nextQuestion() {
    if (!room) return
    const nextIdx = room.current_question_index + 1
    await supabase.from('rooms').update({
      status: nextIdx >= room.total_questions ? 'finished' : 'playing',
      current_question_index: nextIdx,
    }).eq('id', room.id)
  }

  async function restartGame() {
    if (!room) return
    await supabase.from('votes').delete().eq('room_id', room.id)
    await supabase.from('players').update({ score: 0 }).eq('room_id', room.id)
    await supabase.from('rooms').update({ status: 'waiting', current_question_index: 0, ai_questions: null }).eq('id', room.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <Spinner />
  if (!room)   return null

  if (needsJoin) {
    if (room.status !== 'waiting') return <CannotJoin onBack={() => router.push('/')} />
    return <JoinScreen code={code} joinName={joinName} setJoinName={setJoinName}
      joinError={joinError} joining={joining} onJoin={joinAsPlayer} onBack={() => router.push('/')} />
  }

  if (room.status === 'waiting')
    return <Lobby room={room} players={players} myPlayer={myPlayer} isHost={isHost}
      manualName={manualName} setManualName={setManualName} addingManual={addingManual}
      onAddManual={addManualPlayer} onRemove={removePlayer} onStart={startGame}
      selectedMode={mode} onSelectMode={selectMode} isStarting={startingGame} />

  if (room.status === 'playing')
    return <GameQuestion room={room} players={players} question={currentQ!} myPlayer={myPlayer}
      myVote={myVote} voteCounts={voteCounts} roundVotes={roundVotes} isHost={isHost}
      modeConfig={modeConfig} onVote={castVote} onReveal={revealRound} />

  if (room.status === 'revealing')
    return <Reveal room={room} players={players} tiedPlayers={tiedPlayers} voteCounts={voteCounts}
      revealStep={revealStep} question={currentQ!} isHost={isHost} onNext={nextQuestion} />

  if (room.status === 'finished')
    return <Finished players={players} isHost={isHost} onRestart={restartGame} />

  return null
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="min-h-dvh bg-zinc-950 flex items-center justify-center">
      <div className="w-10 h-10 border-[3px] border-pink-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── Cannot join ──────────────────────────────────────────────────────────────

function CannotJoin({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-dvh bg-zinc-950 flex items-center justify-center p-6">
      <div className="text-center space-y-4 animate-fade-up">
        <p className="text-5xl">😬</p>
        <p className="text-xl font-bold text-white">El juego ya comenzó</p>
        <p className="text-zinc-500 text-sm">No puedes unirte en este momento</p>
        <button onClick={onBack}
          className="mt-2 bg-zinc-900 border border-zinc-800 text-white font-semibold px-6 py-3 rounded-2xl text-sm active:scale-95 transition-all">
          ← Volver al inicio
        </button>
      </div>
    </div>
  )
}

// ─── Join screen ──────────────────────────────────────────────────────────────

function JoinScreen({ code, joinName, setJoinName, joinError, joining, onJoin, onBack }: {
  code: string; joinName: string; setJoinName: (v: string) => void
  joinError: string; joining: boolean; onJoin: () => void; onBack: () => void
}) {
  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-xs space-y-6 animate-fade-up">
        <div className="text-center space-y-1">
          <p className="text-zinc-500 text-xs tracking-widest uppercase">Unirte a la sala</p>
          <p className="text-4xl font-black tracking-[0.3em] text-white">{code}</p>
        </div>
        <div className="space-y-3">
          <input autoFocus type="text" placeholder="Tu nombre" value={joinName}
            onChange={e => setJoinName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onJoin()}
            maxLength={20}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-pink-500/60 transition-colors text-sm" />
          {joinError && <p className="text-red-400 text-xs text-center">{joinError}</p>}
          <button onClick={onJoin} disabled={joining}
            className="w-full bg-gradient-to-r from-pink-600 to-violet-600 active:scale-95 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 text-sm shadow-lg shadow-pink-900/30">
            {joining ? 'Uniéndose...' : 'Unirse a la sala'}
          </button>
          <button onClick={onBack} className="w-full text-zinc-600 text-sm py-2">Volver al inicio</button>
        </div>
      </div>
    </div>
  )
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

function Lobby({ room, players, myPlayer, isHost, manualName, setManualName, addingManual,
  onAddManual, onRemove, onStart, selectedMode, onSelectMode, isStarting }: {
  room: Room; players: Player[]; myPlayer: Player | null; isHost: boolean
  manualName: string; setManualName: (v: string) => void; addingManual: boolean
  onAddManual: () => void; onRemove: (id: string) => void; onStart: () => void
  selectedMode: GameMode; onSelectMode: (m: GameMode) => void; isStarting?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const canStart = players.length >= 2
  const cfg = GAME_MODES.find(m => m.id === selectedMode) ?? GAME_MODES[0]

  function copyCode() {
    navigator.clipboard.writeText(room.code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col">

      {/* ── Sticky header ── */}
      <div className="flex-shrink-0 px-5 pt-6 pb-4 border-b border-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-600 text-xs tracking-widest uppercase mb-0.5">Código de sala</p>
            <p className="text-3xl font-black tracking-[0.25em] text-white leading-none">{room.code}</p>
          </div>
          <button onClick={copyCode}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95
              ${copied ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'}`}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

        {/* Modes */}
        <div>
          <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-3">Modo de Juego</p>
          <div className="space-y-2">
            {GAME_MODES.map(m => {
              const active = m.id === selectedMode
              return (
                <button key={m.id} onClick={() => isHost && onSelectMode(m.id)} disabled={!isHost}
                  className={`w-full flex items-start gap-3 rounded-2xl p-4 border transition-all text-left
                    ${active ? `bg-gradient-to-r ${m.gradient} border-transparent shadow-lg` : 'bg-zinc-900 border-zinc-800/70'}
                    ${isHost ? 'active:scale-[0.98] cursor-pointer' : 'cursor-default'}`}>
                  <span className="text-2xl mt-0.5 flex-shrink-0">{m.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-white">{m.name}</p>
                    <p className={`text-xs mt-0.5 leading-relaxed line-clamp-2 ${active ? 'text-white/70' : 'text-zinc-500'}`}>{m.description}</p>
                  </div>
                  {active && (
                    <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5">✓</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Players */}
        <div>
          <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-3">
            Jugadores · {players.length}
          </p>
          <div className="space-y-2">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800/50 rounded-2xl px-4 py-3">
                <Avatar name={p.name} index={i} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {p.name}
                    {p.id === myPlayer?.id && <span className="text-zinc-600 font-normal text-xs"> · tú</span>}
                  </p>
                  {p.is_manual && <p className="text-zinc-600 text-xs">sin dispositivo</p>}
                </div>
                {isHost && p.id !== myPlayer?.id && (
                  <button onClick={() => onRemove(p.id)}
                    className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 flex items-center justify-center text-base transition-all active:scale-90">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="flex-shrink-0 border-t border-zinc-900 px-5 py-5 space-y-3 bg-zinc-950">
        {isHost ? (
          <>
            <div className="flex gap-2">
              <input type="text" placeholder="Añadir sin móvil..." value={manualName}
                onChange={e => setManualName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAddManual()}
                maxLength={20}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 text-sm" />
              <button onClick={onAddManual} disabled={addingManual || !manualName.trim()}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors active:scale-95">
                + Add
              </button>
            </div>
            <button onClick={onStart} disabled={!canStart || isStarting}
              className={`w-full bg-gradient-to-r ${cfg.gradient} hover:opacity-90 active:scale-[0.98] text-white font-black py-4 rounded-2xl transition-all disabled:opacity-40 text-base shadow-lg`}>
              {isStarting ? '✨ Generando preguntas...' : canStart ? `¡Jugar ${cfg.emoji} ${cfg.name}!` : 'Mínimo 2 jugadores'}
            </button>
          </>
        ) : (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />
              <p className="text-zinc-500 text-sm">Esperando al anfitrión...</p>
            </div>
            <p className="text-zinc-700 text-xs">{cfg.emoji} {cfg.name}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Game question ────────────────────────────────────────────────────────────

function GameQuestion({ room, players, question, myPlayer, myVote, voteCounts, roundVotes,
  isHost, modeConfig, onVote, onReveal }: {
  room: Room; players: Player[]; question: string; myPlayer: Player | null
  myVote: Vote | undefined; voteCounts: Record<string, number>; roundVotes: Vote[]
  isHost: boolean; modeConfig: typeof GAME_MODES[0]; onVote: (id: string) => void; onReveal: () => void
}) {
  const totalVotes    = roundVotes.length
  const connectedCount = players.filter(p => !p.is_manual).length
  const progress      = ((room.current_question_index + 1) / room.total_questions) * 100

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col">

      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-xs font-bold ${modeConfig.accentColor} flex items-center gap-1.5`}>
            {modeConfig.emoji} {modeConfig.name}
          </span>
          <span className="text-zinc-600 text-xs">{totalVotes}/{connectedCount} votaron</span>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
          <div className={`h-full bg-gradient-to-r ${modeConfig.gradient} rounded-full transition-all duration-500`}
            style={{ width: `${progress}%` }} />
        </div>
        <p className="text-zinc-700 text-xs mt-1.5 text-right">
          {room.current_question_index + 1} / {room.total_questions}
        </p>
      </div>

      {/* Question card */}
      <div className="flex-shrink-0 px-5 mb-5">
        <div className={`bg-gradient-to-br ${modeConfig.gradient} p-[1px] rounded-3xl`}>
          <div className="bg-zinc-950 rounded-3xl p-6">
            <p className="text-white font-bold text-lg leading-snug text-center">{question}</p>
          </div>
        </div>
      </div>

      {/* Vote area */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {!myVote ? (
          <>
            <p className="text-zinc-600 text-xs text-center mb-4">Toca para votar</p>
            <div className="grid grid-cols-2 gap-3">
              {players.map((p, i) => {
                const isMe = p.id === myPlayer?.id
                return (
                  <button key={p.id} onClick={() => onVote(p.id)}
                    className="flex flex-col items-center gap-2.5 rounded-2xl py-5 px-3 border transition-all bg-zinc-900 border-zinc-800 hover:border-pink-500/40 active:scale-95 active:bg-zinc-800">
                    <Avatar name={p.name} index={i} size="md" />
                    <span className="text-white text-sm font-bold truncate w-full text-center leading-tight">{p.name}</span>
                    {isMe && <span className="text-zinc-500 text-[10px] -mt-1">tú</span>}
                    {p.is_manual && <span className="text-zinc-600 text-[10px] -mt-1">sin móvil</span>}
                  </button>
                )
              })}
            </div>
            {isHost && (
              <button onClick={onReveal}
                className="mt-5 w-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 font-semibold py-3 rounded-2xl text-sm transition-all active:scale-95">
                Revelar sin esperar →
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[300px] space-y-5 animate-fade-up">
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${modeConfig.gradient} flex items-center justify-center text-2xl shadow-lg`}>✓</div>
            <div className="text-center">
              <p className="text-white font-bold">Votaste por</p>
              <p className={`text-xl font-black ${modeConfig.accentColor}`}>
                {players.find(p => p.id === myVote.voted_for_id)?.name}
              </p>
            </div>
            <p className="text-zinc-600 text-sm">Esperando a los demás...</p>
            <div className="w-full space-y-2 mt-2">
              {players.map((p, i) => {
                const count = voteCounts[p.id] ?? 0
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-zinc-900 rounded-xl px-3 py-2.5">
                    <Avatar name={p.name} index={i} size="sm" />
                    <span className="flex-1 text-white text-sm font-semibold truncate">{p.name}</span>
                    {count > 0 && (
                      <span className="text-pink-400 font-bold text-sm">{count} 🗳️</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Reveal ───────────────────────────────────────────────────────────────────

function Reveal({ room, players, tiedPlayers, voteCounts, revealStep, question, isHost, onNext }: {
  room: Room; players: Player[]; tiedPlayers: Player[]
  voteCounts: Record<string, number>; revealStep: number
  question: string; isHost: boolean; onNext: () => void
}) {
  const consequence = getConsequence(room.id, room.current_question_index)
  const isLast      = room.current_question_index + 1 >= room.total_questions
  const voteCount   = tiedPlayers[0] ? (voteCounts[tiedPlayers[0].id] ?? 0) : 0
  const isTie       = tiedPlayers.length > 1

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col items-center justify-between px-5 py-10">

      {/* Question label */}
      <p className="text-zinc-600 text-xs text-center max-w-xs leading-relaxed">{question}</p>

      {/* Main reveal */}
      <div className="flex-1 flex items-center justify-center w-full">

        {/* Step 0 — Suspense */}
        {revealStep === 0 && (
          <div className="text-center space-y-6 animate-fade-up">
            <div className="w-36 h-36 mx-auto rounded-full bg-gradient-to-br from-pink-600 to-violet-600 flex items-center justify-center animate-pulse-glow shadow-2xl shadow-pink-900/50">
              <span className="text-7xl font-black text-white">?</span>
            </div>
            <p className="text-3xl font-black text-white tracking-widest">QUIÉN ES...</p>
          </div>
        )}

        {/* Step 1+ — Name(s) reveal */}
        {revealStep >= 1 && tiedPlayers.length > 0 && (
          <div className="text-center space-y-5 animate-pop-in w-full">
            {isTie && (
              <div className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold px-3 py-1.5 rounded-full">
                ⚡ EMPATE
              </div>
            )}

            {/* Avatars — side by side if tie */}
            <div className={`flex justify-center gap-5 flex-wrap`}>
              {tiedPlayers.map(p => {
                const idx = players.findIndex(pl => pl.id === p.id)
                return (
                  <div key={p.id} className="flex flex-col items-center gap-2">
                    <Avatar name={p.name} index={idx} size={isTie ? 'lg' : 'xl'} />
                    <p className={`font-black text-white ${isTie ? 'text-2xl' : 'text-4xl'}`}>{p.name}</p>
                  </div>
                )
              })}
            </div>

            <p className="text-zinc-500 text-sm">
              {voteCount} {voteCount === 1 ? 'voto' : 'votos'}
              {isTie ? ` cada uno` : ''}
            </p>
            <p className="text-5xl">{isTie ? '😱🤝😱' : '😱'}</p>
          </div>
        )}
      </div>

      {/* Step 2 — Consequence */}
      <div className="w-full max-w-xs space-y-4">
        {revealStep >= 2 && (
          <div className="animate-slide-down space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">
                Consecuencia{isTie ? ` para ${tiedPlayers.map(p => p.name).join(' y ')}` : ` para ${tiedPlayers[0]?.name}`}
              </p>
              <p className="text-white font-bold text-lg leading-snug">{consequence}</p>
            </div>
            {isHost ? (
              <button onClick={onNext}
                className="w-full bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-90 active:scale-95 text-white font-black py-4 rounded-2xl transition-all text-base shadow-lg shadow-pink-900/30">
                {isLast ? '🏆 Ver resultados' : 'Siguiente →'}
              </button>
            ) : (
              <p className="text-center text-zinc-600 text-sm">Esperando al anfitrión...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Finished ─────────────────────────────────────────────────────────────────

function Finished({ players, isHost, onRestart }: {
  players: Player[]; isHost: boolean; onRestart: () => void
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const winner = sorted[0]
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col">

      {/* Header */}
      <div className="flex-shrink-0 text-center px-5 pt-10 pb-6 space-y-2 animate-fade-up">
        <p className="text-6xl">🏆</p>
        <p className="text-3xl font-black text-white">Resultados finales</p>
        {winner && (
          <p className="text-zinc-400 text-sm">
            ¡<span className="text-pink-400 font-bold">{winner.name}</span> fue el más expuesto!
          </p>
        )}
      </div>

      {/* Leaderboard */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
        {sorted.map((p, i) => {
          const isFirst = i === 0
          return (
            <div key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all
                ${isFirst ? 'bg-gradient-to-r from-pink-600/25 to-violet-600/25 border border-pink-500/30' : 'bg-zinc-900 border border-zinc-800/50'}`}
              style={{ animationDelay: `${i * 60}ms` }}>
              <span className="text-xl w-7 text-center flex-shrink-0">
                {medals[i] ?? <span className="text-zinc-500 font-bold text-sm">{i + 1}</span>}
              </span>
              <Avatar name={p.name} index={players.findIndex(pl => pl.id === p.id)} size="sm" />
              <span className="flex-1 text-white font-semibold text-sm truncate">{p.name}</span>
              <div className="text-right flex-shrink-0">
                <span className={`font-black text-xl ${isFirst ? 'text-pink-400' : 'text-zinc-400'}`}>{p.score}</span>
                <p className="text-zinc-600 text-[10px]">{p.score === 1 ? 'vez' : 'veces'}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {isHost && (
        <div className="flex-shrink-0 px-5 py-5 border-t border-zinc-900">
          <button onClick={onRestart}
            className="w-full bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-90 active:scale-95 text-white font-black py-4 rounded-2xl transition-all text-base shadow-lg shadow-pink-900/30">
            Jugar de nuevo 🔁
          </button>
        </div>
      )}
    </div>
  )
}
