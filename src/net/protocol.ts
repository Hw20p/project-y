// 클라이언트와 서버가 WebSocket으로 주고받는 메시지. JSON 한 줄이 메시지 하나다.
// 서버는 방마다 게임 상태를 들고, 클라이언트에는 `viewFor`로 걸러 낸 화면 상태만 보낸다.
import type { ClientAction, GameView } from '../engine/view.ts'

export const MAX_NAME_LENGTH = 12
export const ROOM_CODE_LENGTH = 4

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  /** 연결이 끊겼다가 돌아올 때. 처음 입장할 때 받은 토큰으로 같은 자리에 다시 앉는다. */
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'start' }
  | { t: 'action'; action: ClientAction }
  /** 서술을 읽는 중인지 (일시적 접속 정보, 게임 상태가 아님) */
  | { t: 'reading'; reading: boolean }
  /** 방장 전용: 안 고른 사람을 기다리지 않고 지금 있는 선택만으로 진행 */
  | { t: 'force' }
  | { t: 'leave' }

export interface LobbyMember {
  id: string
  name: string
  online: boolean
}

export type ServerMsg =
  | { t: 'joined'; code: string; playerId: string; token: string }
  | { t: 'lobby'; code: string; you: string; hostId: string; members: LobbyMember[] }
  | {
      t: 'state'
      code: string
      hostId: string
      /** 플레이어 id → 접속 중인지 */
      online: Record<string, boolean>
      /** 지금 서술을 읽고 있는 사람들 */
      reading: string[]
      view: GameView
    }
  | { t: 'error'; message: string }

// ───────────────────────── 검증 ─────────────────────────

const isString = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max

/** 받은 문자열을 `ClientMsg`로 해석한다. 모양이 맞지 않으면 null (서버는 무시한다). */
export function parseClientMsg(raw: string): ClientMsg | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const m = data as Record<string, unknown>

  switch (m.t) {
    case 'create':
      return isString(m.name, 64) ? { t: 'create', name: m.name } : null
    case 'join':
      return isString(m.code, 16) && isString(m.name, 64) ? { t: 'join', code: m.code, name: m.name } : null
    case 'rejoin':
      return isString(m.code, 16) && isString(m.token, 128) ? { t: 'rejoin', code: m.code, token: m.token } : null
    case 'start':
    case 'force':
    case 'leave':
      return { t: m.t }
    case 'reading':
      return typeof m.reading === 'boolean' ? { t: 'reading', reading: m.reading } : null
    case 'action': {
      const a = m.action as Record<string, unknown> | null
      if (typeof a !== 'object' || a === null) return null
      if (a.type === 'ready') return { t: 'action', action: { type: 'ready' } }
      if ((a.type === 'vote' || a.type === 'night') && isString(a.choiceId, 64)) {
        return { t: 'action', action: { type: a.type, choiceId: a.choiceId } }
      }
      return null
    }
    default:
      return null
  }
}

/** 이름을 다듬는다: 앞뒤 공백 제거, 연속 공백 하나로, 길이 제한. 비면 null. */
export function cleanName(name: string): string | null {
  const cleaned = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return cleaned.length > 0 ? cleaned : null
}
