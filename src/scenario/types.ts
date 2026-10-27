// 시나리오 모드의 콘텐츠 형식. 대상 하나가 "장면 그래프"이고, 판정에 난수가 없다.
// 같은 선택이면 항상 같은 결과이므로 모든 길을 도구로 검증할 수 있다. (판마다 바뀌는 것은 시드로 정해지는 `vars`뿐이다.)
import type { StatKey } from './stats.ts'

/** 아이템: 이름과 설명. 가진 사람이 조건(`item`)으로 길을 연다. */
export interface ItemDef {
  id: string
  name: string
  text: string
}

/** 사실(단서): 알아낸 사람만 아는 것. 단서 노트에 남는다. */
export interface HintDef {
  id: string
  text: string
  /** 이번 판에서만 뜻이 있는 사실 (판마다 바뀌는 값을 가리킨다). 조사 보드에는 붙지만 단서 노트에는 보이지 않는다. */
  run?: boolean
}

/** 조사 보드의 의문 하나: 풀어야 할 질문과, 그에 관련된 단서들 */
export interface QuestionDef {
  id: string
  text: string
  /** 이 의문과 관련된 사실들. 파티 중 누구라도 하나를 알면 의문이 보이고, 내가 아는 단서가 아래에 붙는다. */
  facts: string[]
  /** 풀렸는지 (보통 추리 장면에서 켜는 깃발) */
  solved: Cond
  /**
   * 지금 풀고 있는(또는 풀 수 있는) 의문인지. 이 조건이 맞으면 단서가 없어도 의문이 보이고 "지금 과제"로 강조된다.
   * 비워 두면 단서를 아는 사람이 생겨야 의문이 보이고 강조되지 않는다. 과제를 하나씩 푸는 시나리오가 쓴다.
   */
  open?: Cond
  /** 풀렸을 때 보드에 적히는 답 */
  answer: Text
}

/** 조사 보드: 지금 무엇을 해야 하고 무엇이 풀렸는지를 한눈에 보인다 */
export interface BoardDef {
  goal: string
  questions: QuestionDef[]
}

/**
 * 대상 자료의 한 항목. `unlock.hint`가 있으면 그 사실을 단서 노트에 가진 사람의 화면에서만 열린다 (말로 전해야 다른 사람이 읽는다).
 * 없으면 처음부터 열려 있다.
 */
export interface DossierEntry {
  id: string
  title: string
  lines: string[]
  unlock?: { hint?: string }
}

// ───────────────────────── 조건 ─────────────────────────

/** 조건을 볼 때 "누구"의 것을 볼지: any=파티 중 누구라도, actor=지금 행동한 사람, me=이 글을 읽는 사람 */
export type Who = 'any' | 'actor' | 'me'

/**
 * 장면이 열리는 조건, 갈림길의 조건, 글의 조건에 쓴다.
 * - `item`/`knows`/`hurt`의 `by`를 비우면 `any`다.
 * - `actor`는 `split`의 비공개 발견에서만, `me`는 글(`Text`)에서만 의미가 있다 (검증기가 확인한다).
 * - `picked`는 분할 장면의 결과 조건에서만 쓴다: 그 행동을 고른 사람 수 (기본 1명 이상).
 */
export type Cond =
  | { flag: string }
  | { item: string; by?: Who }
  | { knows: string; by?: Who }
  | { hurt: Who | 'all' }
  /** 스텟이 기준에 닿았는지 (min 이상, max 이하). 확률이 아니라 **기준선**이다. `by`를 비우면 파티 중 누구라도. */
  | { stat: StatKey; min?: number; max?: number; by?: Who }
  /** 정신을 잃은 사람이 있는지 (정신력 0) */
  | { panic: Who | 'all' }
  | { time: { min?: number; max?: number } }
  /** 함께하는 인원수 (min 이상, max 이하) */
  | { party: { min?: number; max?: number } }
  | { var: string; is: string | number }
  | { picked: string; count?: { min?: number; max?: number } }
  | { not: Cond }
  | { all: Cond[] }
  | { any: Cond[] }

/** 글: 문자열이거나, 조건이 맞는 조각만 이어 붙인다. `{이름}`은 이번 판의 무작위 값으로, `{players}`는 함께하는 인원수로 바뀐다. */
export type Text = string | { text: string; when?: Cond }[]

/** 다음 장면: 하나로 정해져 있거나, 위에서부터 처음 맞는 조건의 장면 (마지막은 조건 없이 둔다) */
export type Route = string | { when?: Cond; to: string }[]

// ───────────────────────── 효과 ─────────────────────────

/**
 * 효과를 받는 사람
 * - `all`: 파티 전원
 * - `actor`: 비공개 발견을 한 그 사람 (`split`의 `private`에서만)
 * - `{ picked }`: 그 행동을 고른 사람들 (`split`에서만)
 */
export type Target = 'all' | 'actor' | { picked: string }

export type Effect =
  | { flag: string; off?: boolean }
  | { give: string; to: Target }
  | { take: string; from: Target }
  | { learn: string; to: Target }
  | { hurt: Target }
  | { heal: Target }
  /** 스텟을 `add`만큼 올리거나(+) 깎는다(−). 0~한계 사이로 잘린다. 정신력이 0이 되면 정신을 잃는다. */
  | { stat: StatKey; add: number; to: Target }
  /** 시계를 `time`만큼 흘린다 */
  | { time: number }

// ───────────────────────── 장면 ─────────────────────────

interface NodeBase {
  id: string
  /** 장면 제목 (화면 위쪽에 보인다) */
  title?: string
  /**
   * 이 장면이 낮인지 밤인지. 비워 두면 앞 장면의 시간대를 이어받는다 (처음은 낮).
   * 밤에서 낮으로 넘어갈 때마다 하루가 지난다 — 화면에는 "1일째 낮"처럼 보인다.
   */
  period?: 'day' | 'night'
  /** 이 장면에 들어올 때 적용되는 효과 */
  onEnter?: Effect[]
}

/** 읽고 다 같이 "계속"을 누르면 `next`로 간다 */
export interface StoryNode extends NodeBase {
  kind: 'story'
  text: Text
  next: Route
}

export interface VoteChoice {
  id: string
  text: Text
  /** 이 조건이 맞아야 고를 수 있다. 안 맞으면 숨기거나, `locked`가 있으면 잠긴 채로 보여 준다. */
  when?: Cond
  /** 조건이 안 맞을 때 잠긴 선택지에 붙는 문구 (없으면 선택지가 아예 안 보인다) */
  locked?: string
  /** 선택한 직후 모두에게 보이는 결과 서술 (효과가 적용된 뒤의 상태로 쓴다) */
  result?: Text
  effects?: Effect[]
  /**
   * **나중에** 적용되는 효과: 선택한 직후가 아니라 다음 장면(개인 단계에서는 이어지는 다음 단계)에 들어갈 때 적용된다.
   * 정신력을 깎는 대가처럼 "고르자마자 틀렸다고 알려 주고 싶지 않은" 효과에 쓴다. 적용될 때 "여파"로 화면에 보인다.
   */
  later?: Effect[]
  next: Route
}

/** 다 같이 하나를 고른다. 다수결이고 **동률이면 무작위로 하나가 뽑힌다**(시드로 정해지고, 화면에는 추첨 연출이 나온다). */
export interface VoteNode extends NodeBase {
  kind: 'vote'
  text: Text
  choices: VoteChoice[]
}

export interface SplitAction {
  id: string
  text: Text
  when?: Cond
  locked?: string
  /** 이 행동을 고를 수 있는 최대 인원 (1이면 한 사람만). 먼저 고른 사람이 차지한다. */
  max?: number
  /**
   * 이 행동을 해야 하는 최소 인원 (2 이상, "둘이 함께 해야 열리는" 행동). 인원이 모자라면 장면이 진행되지 않고
   * (동률 투표처럼) 함께할 사람을 모아야 한다. 방장의 강제 진행으로 넘어가면 인원이 모자란 행동은 한 것으로 치지 않는다.
   * 이 행동을 고를 수 있는 사람이 `min`명보다 적으면(혼자일 때 등) 선택지가 보이지 않는다.
   */
  min?: number
  /** true면 부상자는 고를 수 없다 (몸을 쓰는 행동) */
  needsHealthy?: boolean
  /** true면 정신을 잃은 사람도 고를 수 있다 (진정시키는 행동). 정신을 잃은 사람은 이런 행동 말고는 고를 수 없다. */
  calming?: boolean
}

/** 사람마다 이 행동을 고른 사람에게만 보이는 발견 */
export interface PrivateFinding {
  action: string
  when?: Cond
  text: Text
  /** 효과의 `to`는 보통 `actor`(발견한 그 사람)다 */
  effects?: Effect[]
  /** 나중에 적용되는 효과 (다음 장면에 들어갈 때). 발견의 대가를 바로 보이지 않게 할 때 쓴다. */
  later?: Effect[]
}

export interface SplitOutcome {
  /** 사람들이 고른 행동의 조합에 대한 조건 (`picked`) 등. 위에서부터 처음 맞는 것이 적용된다. 마지막은 조건 없이 둔다. */
  when?: Cond
  text?: Text
  effects?: Effect[]
  /**
   * **나중에** 적용되는 효과: 선택한 직후가 아니라 다음 장면(개인 단계에서는 이어지는 다음 단계)에 들어갈 때 적용된다.
   * 정신력을 깎는 대가처럼 "고르자마자 틀렸다고 알려 주고 싶지 않은" 효과에 쓴다. 적용될 때 "여파"로 화면에 보인다.
   */
  later?: Effect[]
  next: Route
}

/** 각자 다른 행동을 동시에 고른다. 한 사람이 하나씩 고르고, 모두의 **조합**이 결과를 정한다. */
export interface SplitNode extends NodeBase {
  kind: 'split'
  text: Text
  actions: SplitAction[]
  /** 행동을 고른 사람에게만 보이는 발견 (사람마다 다른 정보) */
  private?: PrivateFinding[]
  outcomes: SplitOutcome[]
}

/** 혼자 하는 장면의 선택지 */
export interface SoloChoice {
  id: string
  text: Text
  when?: Cond
  locked?: string
  /** 정신을 잃은 사람도 고를 수 있는 선택지 (진정시키는 것) */
  calming?: boolean
  /** 고른 직후 그 사람에게만 보이는 서술 */
  result?: Text
  /** 효과의 대상은 `actor`(고른 사람) 또는 `all` */
  effects?: Effect[]
  /**
   * **나중에** 적용되는 효과: 선택한 직후가 아니라 다음 장면(개인 단계에서는 이어지는 다음 단계)에 들어갈 때 적용된다.
   * 정신력을 깎는 대가처럼 "고르자마자 틀렸다고 알려 주고 싶지 않은" 효과에 쓴다. 적용될 때 "여파"로 화면에 보인다.
   */
  later?: Effect[]
  /** 이어지는 개인 단계 (없으면 이 사람의 개인 행동이 끝난다) */
  then?: string
}

/**
 * 개인 장면의 한 단계: 그 사람 혼자만 읽고 고른다. 다른 사람은 "개인 행동 중"이라는 것만 안다.
 * 선택지가 없으면 읽고 계속을 누르면 `then`으로 간다.
 */
export interface PersonalStep {
  id: string
  text: Text
  /** 이 단계에 들어올 때 그 사람에게 적용되는 효과 (대상은 `actor`) */
  effects?: Effect[]
  choices?: SoloChoice[]
  then?: string
}

export interface PersonalOption {
  id: string
  text: Text
  when?: Cond
  locked?: string
  calming?: boolean
  /** 고른 직후 그 사람에게만 보이는 서술 */
  result?: Text
  /** 고른 사람에게 바로 적용되는 효과 (`actor` 또는 `all`) */
  effects?: Effect[]
  /**
   * **나중에** 적용되는 효과: 선택한 직후가 아니라 다음 장면(개인 단계에서는 이어지는 다음 단계)에 들어갈 때 적용된다.
   * 정신력을 깎는 대가처럼 "고르자마자 틀렸다고 알려 주고 싶지 않은" 효과에 쓴다. 적용될 때 "여파"로 화면에 보인다.
   */
  later?: Effect[]
  /** 이어지는 개인 단계. 완전히 개인만 볼 수 있는 선택지·발견이 이어진다. 없으면 바로 끝. */
  then?: string
}

/**
 * 각자 하나씩 고르고, **고른 것이 그 사람에게 그대로 적용된다** (다수결이 아니다. 같은 걸 여럿이 골라도 된다).
 * 누가 무엇을 골랐는지는 모두에게 보이고, 고른 뒤 이어지는 개인 단계는 그 사람만 본다.
 * 모두가 끝나면 `next`로 간다. 밤의 개인 활동(스텟 올리기·혼자 조사하기)에 쓴다.
 */
export interface PersonalNode extends NodeBase {
  kind: 'personal'
  text: Text
  options: PersonalOption[]
  steps?: PersonalStep[]
  next: Route
}

export type EndingTier = 'bad' | 'neutral' | 'good' | 'true'

export interface EndingNode extends NodeBase {
  kind: 'ending'
  text: Text
  tier: EndingTier
}

export type Node = StoryNode | VoteNode | SplitNode | PersonalNode | EndingNode

// ───────────────────────── 시나리오 ─────────────────────────

/** 판이 시작될 때 시드로 뽑히는 값 (암호·열쇠 위치처럼 외워서는 안 되게 하는 것) */
export interface VarSpec {
  id: string
  /** 이 중 하나가 같은 확률로 뽑힌다 */
  pick: (string | number)[]
}

export interface Scenario {
  id: string
  code: string
  name: string
  type: 'creature' | 'place' | 'object'
  /** 함께할 수 있는 인원. 정원이 필요한 분할 장면이 있으면 최소 인원이 2 이상일 수 있다. 기본 1~8명. */
  party?: { min: number; max: number }
  /** 대기실 지도에서의 위치(0~100, 왼쪽 위가 0,0). 점으로 찍혀 이름만 보이고, 누르면 소개가 보인다. */
  map?: { x: number; y: number }
  /** 방에서 고를 때 보이는 소개. 스포일러가 되지 않게 분위기만 쓴다. */
  blurb: string
  /** 정보 패널에 쓰이는 대상 소개 */
  summary: string
  observation: string[]
  manual: string[]
  /** 대상 자료. 잠금은 `unlock.hint`(단서 id)만 쓴다: 단서 노트에 그 단서가 있는 사람에게 열린다. */
  dossier?: DossierEntry[]
  items: ItemDef[]
  /** 알아낼 수 있는 사실들. 한 번 알아내면 단서 노트에 남는다. */
  facts: HintDef[]
  /** 조사 보드: 목표와 풀어야 할 의문들 */
  board?: BoardDef
  vars?: VarSpec[]
  /**
   * 시계의 이름들. 시계 값이 인덱스이고, 끝을 넘으면 마지막 이름을 쓴다.
   * `light`가 참이면 시계가 조명이다: 화면 위에 남은 조명이 막대로 보이고(마감 `deadline`까지), 화면이 점점 어두워진다.
   * 이름은 "조명이 환하다 → 깜빡인다 → …"처럼 상태를 말로 쓴다.
   * `per`: 시계가 이만큼 흐를 때마다 이름이 한 칸 넘어간다(기본 1). 시계 1에서 첫 칸이 넘어가고 `per`만큼 더 흐를 때마다 한 칸씩이다 —
   * 하루가 지날 때 시계가 1 오르는 시나리오에서 `per`가 2면 2일째, 4일째, 6일째… 이틀에 한 번 조명이 어두워진다.
   * `byDay`: 밤에서 낮으로 넘어갈 때(하루가 지날 때) 시계가 자동으로 1 흐른다. 장면의 `period`를 정해 둔 시나리오가 쓴다.
   * 이때 며칠째인지는 시계 값에서 나오고(시계 + 1일째), 성공했든 실패했든 하루가 지나면 조명이 똑같이 어두워진다.
   * `deadline.time`은 언제나 시계 값 기준이다.
   */
  clock: { labels: string[]; light?: boolean; per?: number; byDay?: boolean }
  /** 시계가 이 값에 닿으면 (엔딩이 아닌 장면으로 가려 할 때) 대신 이 엔딩으로 간다 */
  deadline?: { time: number; node: string }
  /** 파티 전원이 부상이 되면 이 엔딩으로 간다 */
  onAllHurt?: string
  /** 파티 전원이 정신을 잃으면(정신력 0) 이 엔딩으로 간다 */
  onAllPanic?: string
  start: string
  nodes: Node[]
}
