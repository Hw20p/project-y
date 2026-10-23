// 실제로 플레이할 수 있는 시나리오 목록 (방의 대기실에서 방장이 고른다). 시험용 시나리오(fixtures)는 여기에 넣지 않는다.
import type { Scenario } from '../../scenario/types.ts'
import { b7Lobby } from './b7-lobby.ts'

export const playableScenarios: Scenario[] = [b7Lobby]

export function findScenario(id: string): Scenario | undefined {
  return playableScenarios.find((s) => s.id === id)
}
