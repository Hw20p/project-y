// 엔진은 React/DOM/서버에 의존하지 않는 순수 TS로 유지한다.
// 같은 시드 + 같은 행동 기록이면 항상 같은 결과가 나와야 하므로 Math.random()은 쓰지 않는다.

export interface Rng {
  /** [0, 1) 범위의 난수 */
  next(): number
  /** [min, max] 범위의 정수 */
  int(min: number, max: number): number
  /** 배열에서 하나를 고름 */
  pick<T>(items: readonly T[]): T
  /** 새 배열로 섞음 (Fisher-Yates) */
  shuffle<T>(items: readonly T[]): T[]
  /** 현재 내부 상태. `createRng`에 다시 넘기면 그 지점부터 똑같은 난수열이 이어진다. */
  getState(): number
}

/** mulberry32 — 작고 빠른 시드 기반 PRNG. 암호학적 용도가 아님. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))

  return {
    next,
    int,
    getState: () => state,
    pick: (items) => items[int(0, items.length - 1)],
    shuffle: (items) => {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i)
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
  }
}
