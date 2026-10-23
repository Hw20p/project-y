// 엔진(engine/)과 콘텐츠(content/)가 공유하는 타입.
// 콘텐츠 파일은 `satisfies Entity`로 작성하면 필드 오타를 컴파일 단계에서 잡을 수 있다.

/** 한 달 안에서 진행되는 장면의 종류. day=다 같이 고르는 낮, night=각자 고르는 밤, decision=마지막 결정 */
export type Beat = 'day' | 'night' | 'decision'

/** 결정 선택지의 종류: 방생 / 격리 / 처리 */
export type DecisionKind = 'release' | 'contain' | 'terminate'

/** 선택 결과로 얻는 것 */
export interface Grant {
  /** 아이템 id. 이미 가지고 있으면 무시된다. */
  items?: string[]
  /** 단서 id. 얻은 사람의 화면에서만 해당 선택지에 설명이 붙는다. */
  hints?: string[]
  /** 진실 조각 (팀 공용). 모이면 진엔딩 쪽으로 열린다. */
  fragments?: number
}

export interface Outcome {
  text: string
  /** 위협도 변화. 음수면 줄어든다. */
  threat?: number
  grant?: Grant
}

export interface FailureOutcome extends Outcome {
  /** true면 선택을 실행한 사람이 사망한다 (방호 아이템이 있으면 소모되고 막는다). */
  casualty?: boolean
}

export interface Choice {
  id: string
  text: string
  /** 선택한 직후 결과 앞에 흐르는 "실행 과정" 서술. 판정과 무관하다. */
  story?: string
  /** 성공 확률 (0~1). 화면에는 보이지 않는다. */
  baseChance: number
  /** 이 아이템을 가진 사람이 있으면 성공 확률이 오른다. 낮 선택은 생존한 파티원 전체, 밤 선택은 본인만 본다. */
  boosts?: { item: string; bonus: number }[]
  /** 이 단서를 가진 사람의 화면에서만 선택지에 붙는 설명. 확률은 건드리지 않는다 — 단서는 말로 나눠야 쓸모가 생긴다. */
  hints?: { hint: string; text: string }[]
  /** 생존한 파티원 중 누군가 이 아이템을 가져야 선택지 목록에 나타난다 (낮·결정). 밤에는 본인 기준. */
  requiresItem?: string
  success: Outcome
  failure: FailureOutcome
}

export interface DecisionChoice extends Choice {
  kind: DecisionKind
}

/** 낮 이벤트 (다 같이 고름). 객체마다 풀을 두고 한 달에 5개가 뽑힌다. */
export interface DayEvent {
  id: string
  title: string
  text: string
  choices: Choice[]
}

/** 밤 이벤트 (각자 고름). 모두 같은 장면을 보지만 선택지는 사람마다 일부만 받는다. */
export interface NightEvent {
  title: string
  text: string
  choices: Choice[]
}

export interface ItemDef {
  id: string
  name: string
  text: string
  /** 사망을 한 번 막고 사라진다 */
  protects?: boolean
  /** 사망해 다음 달에 부활해도 잃지 않는다 (엔딩 루트용 아이템) */
  keep?: boolean
}

/** 조사 대상: 생명체·장소·물건 무엇이든 */
export interface Entity {
  id: string
  code: string
  name: string
  /** 종류 표시용 */
  type: 'creature' | 'place' | 'object'
  /** 외형·특징 */
  summary: string
  observation: string[]
  manual: string[]
  dayEvents: DayEvent[]
  night: NightEvent
  /** 방생·격리·처리 각각 하나씩 */
  decisions: DecisionChoice[]
}

/** 단서: 얻은 사람만 아는 사실. 말로 전해야 다른 사람이 안다. */
export interface HintDef {
  id: string
  text: string
}

/** 엔진이 콘텐츠를 찾을 때 쓰는 묶음 */
export interface GameContext {
  entities: Entity[]
  items: ItemDef[]
  hints: HintDef[]
}
