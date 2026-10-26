// 개발 도구(전수 탐색기 등)가 다루는 시나리오 목록. 시나리오를 새로 만들면 여기에 넣는다.
// 첫 대상 B7 로비와 엔진 시험용 시나리오(fixtures)가 있다.
import type { PartyMember } from './explore.ts'
import { playableScenarios } from '../content/scenarios/index.ts'
import { demo } from './fixtures/demo.ts'
import { night } from './fixtures/night.ts'
import { tasksSmall } from './fixtures/tasks.ts'
import { ARCHETYPES } from './stats.ts'
import type { Scenario } from './types.ts'

export const scenarios: Scenario[] = [...playableScenarios, demo, night, tasksSmall]

/** 탐색·시험용 파티: n명, 입사 배경을 돌아가며 준다 */
export function partyOf(n: number): PartyMember[] {
  const names = ['가', '나', '다', '라', '마', '바', '사', '아']
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: names[i] ?? `P${i + 1}`,
    archetype: ARCHETYPES[(i + 2) % ARCHETYPES.length].id,
  }))
}

/** 이 시나리오로 탐색·시험해 볼 인원들 (정원 안에서 최대 3명까지) */
export function partySizes(sc: Scenario): number[] {
  const min = sc.party?.min ?? 1
  const max = Math.min(sc.party?.max ?? 4, 3)
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i)
}
