// 시나리오 모드의 스텟과 입사 배경. 판정에 난수가 없으므로 스텟은 "확률"이 아니라 **기준선**이다:
// 스텟이 기준에 닿아야 열리는 선택지(체력 3 이상이면 몸으로 지름길을 간다, 관찰 3 이상이면 흔적을 한 번에 읽는다 …)와 정신력이라는 예산으로 쓴다.
// 행운은 "운에 의존하는 조사는 두지 않는다"는 원칙과 이름부터 부딪쳐서 뺐다 (2026-10-28).

export const STAT_KEYS = ['sanity', 'body', 'insight'] as const
export type StatKey = (typeof STAT_KEYS)[number]
export type Stats = Record<StatKey, number>

export const STAT_LABEL: Record<StatKey, string> = {
  sanity: '정신력',
  body: '체력',
  insight: '관찰',
}

/** 스텟마다 올라갈 수 있는 한계 (0이 바닥). 정신력이 0이 되면 정신을 잃어 행동할 수 없다. */
export const STAT_MAX: Stats = { sanity: 10, body: 5, insight: 5 }

export const clampStat = (key: StatKey, value: number): number => Math.min(STAT_MAX[key], Math.max(0, value))

/** 정신을 잃은 상태: 정신력이 0이면 `calming` 행동 말고는 아무것도 고를 수 없다 */
export const isPanicked = (p: { stats: Stats }): boolean => p.stats.sanity <= 0

/**
 * 입사 배경: 방에서 시작하기 전에 각자 하나씩 고르는 시작 스텟 묶음.
 * 정신력은 모두 같고, 나머지 스텟의 합도 모두 같다 — "무엇을 포기하느냐"의 선택이 되도록 (검증기가 강제한다).
 */
export interface Archetype {
  id: string
  name: string
  summary: string
  stats: Stats
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'researcher',
    name: '연구원 출신',
    summary: '작은 단서도 놓치지 않지만 몸은 약하다.',
    stats: { sanity: 6, body: 1, insight: 4 },
  },
  {
    id: 'field',
    name: '현장직 출신',
    summary: '몸으로 버티지만 기록 읽기에는 서툴다.',
    stats: { sanity: 6, body: 4, insight: 1 },
  },
  {
    id: 'office',
    name: '사무직 출신',
    summary: '기록과 서류를 읽는 눈이 있지만 몸을 쓰는 일은 서툴다.',
    stats: { sanity: 6, body: 2, insight: 3 },
  },
  {
    id: 'rookie',
    name: '신입',
    summary: '아직 어느 쪽으로도 굳지 않았다. 패기만큼은 있어서 몸이 조금 더 따라 준다.',
    stats: { sanity: 6, body: 3, insight: 2 },
  },
]

export const DEFAULT_ARCHETYPE = 'rookie'

export function findArchetype(id: string | undefined): Archetype {
  return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES.find((a) => a.id === DEFAULT_ARCHETYPE)!
}
