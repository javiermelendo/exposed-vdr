export type RoomStatus = 'waiting' | 'playing' | 'revealing' | 'finished'

export interface Room {
  id: string
  code: string
  host_session_id: string
  status: RoomStatus
  current_question_index: number
  total_questions: number
  mode: string
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  is_manual: boolean
  session_id: string | null
  score: number
  created_at: string
}

export interface Vote {
  id: string
  room_id: string
  round: number
  voter_id: string
  voted_for_id: string
  created_at: string
}
