// 클라이언트와 서버가 WebSocket으로 주고받는 메시지. JSON 한 줄이 메시지 하나다.
// 서버는 방마다 게임 상태를 들고, 클라이언트에는 `viewForScenario`로 걸러 낸 화면 상태만 보낸다.
import type { ScenarioView } from '../scenario/view.ts'

export const MAX_NAME_LENGTH = 12
export const ROOM_CODE_LENGTH = 4
/** 한 방의 최대 인원 (시나리오마다 `party`로 더 좁힐 수 있다) */
export const MAX_PLAYERS = 8

/** 시나리오 모드에서 클라이언트가 보내는 행동. 누가 보냈는지는 서버가 접속 정보로 채운다. */
export type ScenarioClientAction =
  | { type: 'ready' }
  | { type: 'vote'; choiceId: string }
  /** 분할 장면의 행동, 또는 개인 장면에서 처음 고르는 선택지 */
  | { type: 'pick'; actionId: string }
  /** 개인 장면에서 이어지는 개인 단계의 선택지 */
  | { type: 'solo'; choiceId: string }
  /** 모두가 고르기 전에 내 선택을 거둔다 */
  | { type: 'cancel' }

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  /** 연결이 끊겼다가 돌아올 때. 처음 입장할 때 받은 토큰으로 같은 자리에 다시 앉는다. */
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'start' }
  /** 게임 중의 행동 */
  | { t: 'saction'; action: ScenarioClientAction }
  /** 방장 전용(대기실): 이 방에서 할 대상(시나리오 id)을 고른다 */
  | { t: 'mode'; mode: string }
  /** 대기실: 내 입사 배경(시작 스텟)을 고른다 */
  | { t: 'archetype'; archetype: string }
  /** 방장 전용, 시나리오 엔딩 뒤: 같은 대상으로 새 판을 시작한다 (단서 노트·닿은 엔딩은 남는다) */
  | { t: 'retry' }
  /** 서술을 읽는 중인지 (일시적 접속 정보, 게임 상태가 아님) */
  | { t: 'reading'; reading: boolean }
  /** 방장 전용: 안 고른 사람을 기다리지 않고 지금 있는 선택만으로 진행 */
  | { t: 'force' }
  /** 방장 전용, 엔딩 뒤: 같은 방의 대기실로 돌아가 대상을 다시 고른다 */
  | { t: 'rematch' }
  | { t: 'leave' }

export interface LobbyMember {
  id: string
  name: string
  online: boolean
  /** 입사 배경 id */
  archetype: string
}

/** 대기실에서 고를 수 있는 것: 시나리오 하나 */
export interface LobbyModeInfo {
  id: string
  /** 시나리오 코드(A-02 등) */
  code: string
  name: string
  /** 스포일러가 되지 않는 소개 */
  blurb: string
  /** 함께할 수 있는 인원 */
  party: { min: number; max: number }
  /** 대기실 지도에서의 위치(0~100) */
  map: { x: number; y: number }
  /** 시나리오의 종류(생명체·장소·물건) */
  type: string
}

export type ServerMsg =
  | { t: 'joined'; code: string; playerId: string; token: string }
  | {
      t: 'lobby'
      code: string
      you: string
      hostId: string
      members: LobbyMember[]
      /** 지금 고른 것 (시나리오 id) */
      mode: string
      modes: LobbyModeInfo[]
    }
  | {
      t: 'sstate'
      code: string
      gameId: string
      hostId: string
      online: Record<string, boolean>
      reading: string[]
      view: ScenarioView
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
    case 'rematch':
    case 'retry':
    case 'leave':
      return { t: m.t }
    case 'mode':
      return isString(m.mode, 64) ? { t: 'mode', mode: m.mode } : null
    case 'archetype':
      return isString(m.archetype, 64) ? { t: 'archetype', archetype: m.archetype } : null
    case 'saction': {
      const a = m.action as Record<string, unknown> | null
      if (typeof a !== 'object' || a === null) return null
      if (a.type === 'ready') return { t: 'saction', action: { type: 'ready' } }
      if (a.type === 'cancel') return { t: 'saction', action: { type: 'cancel' } }
      if ((a.type === 'vote' || a.type === 'solo') && isString(a.choiceId, 64)) {
        return { t: 'saction', action: { type: a.type, choiceId: a.choiceId } }
      }
      if (a.type === 'pick' && isString(a.actionId, 64)) return { t: 'saction', action: { type: 'pick', actionId: a.actionId } }
      return null
    }
    case 'reading':
      return typeof m.reading === 'boolean' ? { t: 'reading', reading: m.reading } : null
    default:
      return null
  }
}

/** 이름을 다듬는다: 앞뒤 공백 제거, 연속 공백 하나로, 길이 제한. 비면 null. */
export function cleanName(name: string): string | null {
  const cleaned = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return cleaned.length > 0 ? cleaned : null
}
