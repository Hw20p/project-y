// 밸런스 수치. 처음 값은 모두 임시이고 시뮬레이션(npm run sim)으로 맞춘다.
import type { Beat } from './types.ts'

/** 한 달의 진행 순서: 낮2 → 밤1 → 낮3 → 결정1 */
export const MONTH_BEATS: readonly Beat[] = ['day', 'day', 'night', 'day', 'day', 'day', 'decision']

export const CONFIG = {
  MIN_PLAYERS: 1,
  MAX_PLAYERS: 4,
  MIN_CHANCE: 0.03,
  MAX_CHANCE: 0.97,
  /** 위협도가 이 값에 닿으면 시설이 무너지는 엔딩 */
  COLLAPSE_THREAT: 100,
  START_THREAT: 10,
  /** 한 명이 죽을 때마다 오르는 위협도 */
  DEATH_THREAT: 5,
  /** 한 달 안에 전원이 죽었을 때 오르는 위협도 */
  WIPE_THREAT: 15,
  /** 달이 바뀔 때마다 줄어드는 위협도 (시설이 조금씩 복구된다) */
  MONTHLY_RECOVERY: 4,
  /** 밤에 한 사람이 받는 선택지 수 */
  NIGHT_DEAL: 3,
  /** 진엔딩 쪽이 열리는 진실 조각 수 (진엔딩 자체는 아직 자리표시자) */
  TRUTH_FRAGMENTS: 8,
  /** 탈출 엔딩에 필요한 아이템. 달이 끝날 때 생존한 파티원이 합쳐서 가지고 있으면 된다. */
  ESCAPE_ITEMS: ['keycard', 'sidearm'],
} as const
