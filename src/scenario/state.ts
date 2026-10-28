// 시나리오 모드의 진행 상태. 전부 JSON으로 직렬화할 수 있다 (서버 저장·재접속용).

import type { StatKey, Stats } from './stats.ts'
import type { Effect } from './types.ts'

export interface RunPlayer {
  id: string
  name: string
  /** 입사 배경 id (시작 스텟을 정한 것) */
  archetype: string
  /** 스텟. 정신력이 0이면 정신을 잃은 상태다. */
  stats: Stats
  items: string[]
  /** 이번 판에서 알아낸 사실 (글의 `knows` 조건이 본다) */
  facts: string[]
  hurt: boolean
}

/**
 * 진행 단계
 * - story : 장면을 읽는 중 (전원이 "계속"을 누르면 다음으로)
 * - vote  : 다 같이 고르는 중
 * - split : 각자 행동을 고르는 중 (조합이 결과를 정함)
 * - personal: 각자 자기 몫을 고르고(모두 고를 때까지 바꾸거나 취소할 수 있다) 모두 고르면 적용되어 혼자 진행하는 중
 * - result: 선택·행동의 결과를 보는 중 (전원이 "계속"을 누르면 다음으로)
 * - ended : 이번 판이 엔딩에 닿았다 (`retry`로 새 판)
 */
export type RunPhase = 'story' | 'vote' | 'split' | 'personal' | 'result' | 'ended'

/** 효과가 만든 변화. 결과 화면에서 칩으로 보여 준다. */
export type Change =
  | { kind: 'time'; amount: number }
  | { kind: 'stat'; playerId: string; stat: StatKey; amount: number }
  | { kind: 'item'; playerId: string; id: string; gained: boolean }
  | { kind: 'fact'; playerId: string; id: string }
  | { kind: 'hurt'; playerId: string }
  | { kind: 'heal'; playerId: string }

export interface PrivateResult {
  text: string
  changes: Change[]
}

/** 개인 장면에서 한 사람의 진행 */
export interface PersonalProgress {
  /** 처음에 고른 선택지. 모두 고르기 전(`committed`가 거짓)에는 바꾸거나 취소할 수 있다. */
  pick: string | null
  /** 모두가 골라서 고른 것이 적용되었는지. 그 전에는 효과도 글도 아무것도 일어나지 않는다. */
  committed: boolean
  /** 지금 이 사람이 보고 있는 개인 단계 (선택 전이거나 끝났으면 null) */
  step: string | null
  /** 끝났는지 (이어지는 단계를 다 마쳤거나, 정신을 잃어 더 못 한다) */
  done: boolean
  /** 지금까지 이 사람에게만 보인 글 */
  lines: string[]
  changes: Change[]
  /** 다음 개인 단계에 들어갈 때 적용될 효과 (`later`). 이어지는 단계가 없으면 다음 장면으로 넘어간다. */
  later: Effect[]
  /** 지금 단계에 들어오며 적용된 변화 (여파) */
  stepChanges: Change[]
}

/** 다음 장면에 들어갈 때 적용되려고 기다리는 효과 */
export interface PendingEffects {
  effects: Effect[]
  /** `to: 'actor'`가 가리키는 사람 */
  actor?: string
  /** `to: { picked }`를 풀기 위한 행동 조합 */
  picks?: Record<string, string>
}

export interface ScenarioResult {
  kind: 'vote' | 'split' | 'personal'
  nodeId: string
  /** 분할 장면의 이름("조사" 등). 없으면 "조합" */
  label?: string
  /** 투표 장면에서 이긴 선택지의 문장 */
  choiceText?: string
  /** 투표가 동률이라 무작위로 하나가 뽑혔을 때: 동률이던 선택지들과 뽑힌 것의 문장 (화면의 추첨 연출에 쓴다) */
  draw?: { options: string[]; chosen: string }
  /** 투표(플레이어 id → 선택지 id) */
  votes?: Record<string, string>
  /** 분할 행동·개인 선택(플레이어 id → 행동·선택지 id) */
  picks?: Record<string, string>
  /** 그때 있던 선택지·행동 (조합을 문장으로 보여 주기 위함) */
  options: { id: string; text: string }[]
  /** 모두에게 보이는 결과 서술 */
  text: string
  /** 사람마다 다르게 보이는 발견 (플레이어 id → 내용). 본인에게만 전달한다. */
  private: Record<string, PrivateResult>
  /** 모두에게 보이는 변화 (단서를 알아낸 것은 본인에게만 보인다) */
  changes: Change[]
  /** 계속을 누르면 가는 장면 */
  next: string
}

export interface RunState {
  seed: number
  /** 이번 판에서 뽑힌 값 (암호·열쇠 위치 등) */
  vars: Record<string, string | number>
  nodeId: string
  time: number
  /** 지금이 낮인지 밤인지 (장면의 `period`를 따라가고, 정해 두지 않은 장면은 앞의 것을 이어받는다) */
  period: 'day' | 'night'
  flags: string[]
  /** 직전 분할 장면에서 사람마다 고른 행동 (플레이어 id → 행동 id). 다음 개인 장면까지만 남는다. `did` 조건이 본다. */
  lastSplit?: Record<string, string>
  players: RunPlayer[]
  phase: RunPhase
  /** vote: 플레이어 id → 선택지 id */
  votes: Record<string, string>
  /** split·personal: 플레이어 id → 행동·선택지 id */
  picks: Record<string, string>
  /** personal: 플레이어 id → 진행 */
  personal: Record<string, PersonalProgress>
  /** 다음 장면에 들어갈 때 적용될 효과들 (`later`) */
  pending: PendingEffects[]
  /**
   * 보관해 둔 분할 장면의 결과(`SplitNode.holdResult`). 효과는 이미 적용됐고, 이어지는 개인 장면이 끝나면 그 결과와 합쳐서 한 번에 보인다.
   * 개인 장면이 아닌 곳으로 가면 버린다.
   */
  held?: ScenarioResult
  /** 이 장면에 들어오며 적용된 변화 — 지난 선택의 여파와 이 장면의 진입 효과 */
  aftermath: Change[]
  /** story·result에서 "계속"을 누른 사람들 */
  ready: string[]
  result: ScenarioResult | null
  /** 이번 판이 닿은 엔딩 */
  endingId: string | null
  /** 이번 판에서 지나온 장면 (기록·분석용) */
  visited: string[]
}

export interface ScenarioGame {
  scenarioId: string
  baseSeed: number
  /** 몇 번째 판인지 (1부터). 다시 도전할 때마다 늘어난다. */
  runNo: number
  run: RunState
  /** 닿아 본 엔딩: 엔딩 id → 닿은 횟수 */
  endings: Record<string, number>
}
