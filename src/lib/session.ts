const SESSION_KEY = 'exposed_session_id'

export function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function savePlayerId(roomCode: string, playerId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`exposed_player_${roomCode}`, playerId)
}

export function getPlayerId(roomCode: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(`exposed_player_${roomCode}`)
}

export function savePlayerName(name: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem('exposed_player_name', name)
}

export function getPlayerName(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('exposed_player_name') || ''
}
