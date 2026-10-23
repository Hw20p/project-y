// 게임 진행 상태. 전부 JSON으로 직렬화할 수 있는 값만 담는다 (서버 저장·재접속·리플레이용).
import type { Beat, DecisionKind } from './types.ts'

/**
 * 진행 단계
 * - briefing: 새 대상을 소개받는 중 (전원 준비 → 진행)
 * - vote    : 낮/결정 선택지를 다 같이 고르는 중 (생존자 전원이 고르면 진행)
 * - night   : 밤, 각자 자기 선택지를 고르는 중
 * - result  : 결과를 보는 중 (전원 준비 → 진행)
 * - ended   : 엔딩
 */
export type Phase = 'briefing' | 'vote' | 'night' | 'result' | 'ended'

export interface Player {
  id: string
  name: string
  alive: boolean
  items: string[]
  hints: string[]
}

export interface MonthState {
  entityId: string
  /** 0~6, `MONTH_BEATS`의 위치 */
  beatIndex: number
  /** 이번 달에 뽑힌 낮 이벤트 id 5개 (진행 순서) */
  dayEventIds: string[]
  /** 이번 달에 죽은 사람들 */
  deaths: string[]
}

export interface NightState {
  /** 플레이어 id → 받은 선택지 id */
  deal: Record<string, string[]>
  /** 플레이어 id → 고른 선택지 id */
  picks: Record<string, string>
}

/** 결과 한 건의 공통 변화량 */
export interface Effects {
  threat: number
  gainedItems: string[]
  gainedHints: string[]
  fragments: number
  /** 이 선택으로 죽은 사람 */
  diedId?: string
  /** 방호 아이템으로 죽음을 막은 사람 */
  protectedId?: string
}

/** 낮·결정 결과: 팀이 하나를 골라 한 사람이 실행한다 */
export interface TeamResult extends Effects {
  kind: 'team'
  beat: Exclude<Beat, 'night'>
  choiceId: string
  choiceText: string
  decisionKind?: DecisionKind
  success: boolean
  text: string
  story?: string
  /** 선택을 실행한 사람 (이긴 쪽에 투표한 사람 중 무작위). 얻은 것도 이 사람에게 간다. */
  actorId: string
  /** 플레이어 id → 고른 선택지 id */
  votes: Record<string, string>
  /** 그때 있던 선택지들 (투표 결과를 문장으로 보여 주기 위함) */
  options: { id: string; text: string }[]
  /** 최다 득표가 동률이라 무작위로 정해졌는지 */
  tie: boolean
}

export interface NightEntry extends Effects {
  playerId: string
  /** 아무것도 고르지 않았으면 null */
  choiceId: string | null
  /** 고른 선택지 문장. 아무것도 고르지 않았으면 빈 문자열 */
  choiceText: string
  success: boolean
  text: string
}

/** 밤 결과: 각자 한 것이라 본인 것만 자세히 보인다 */
export interface NightResult {
  kind: 'night'
  entries: NightEntry[]
}

export interface MonthEndResult {
  kind: 'monthEnd'
  entityId: string
  wiped: boolean
  /** 부활한 사람들 */
  revived: string[]
  /** 플레이어 id → 부활하며 잃은 아이템 */
  lostItems: Record<string, string[]>
}

export type ResultRecord = TeamResult | NightResult | MonthEndResult

export type EndingId = 'collapse' | 'truth' | 'escape'

export interface Ending {
  id: EndingId
  month: number
}

export interface GameState {
  seed: number
  rngState: number
  phase: Phase
  players: Player[]
  /** 위협도. 오르기만 하는 게 아니라 격리 같은 선택으로 줄일 수 있다. */
  threat: number
  fragments: number
  /** 지금 몇 번째 달인지 (1부터) */
  monthNumber: number
  month: MonthState | null
  /** 앞으로 만날 대상 id (섞어 둔 순서). 비면 새로 섞는다. */
  entityQueue: string[]
  /** vote 단계: 플레이어 id → 고른 선택지 id */
  votes: Record<string, string>
  night: NightState | null
  /** briefing·result 단계에서 "계속"을 누른 사람들 */
  ready: string[]
  lastResult: ResultRecord | null
  ending: Ending | null
}
