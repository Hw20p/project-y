// 무작위로 정해진 결과를 "추첨 연출"로 보여 주는 훅. 결과는 이미 서버(엔진)가 정했고, 여기서는 후보를 훑다가 정해진 곳에 멈추는 모양만 만든다.
// 난수를 쓰지 않는다: 항상 마지막에 `finalIndex`에 멈추도록 거꾸로 세어 시작 위치를 정한다.
import { useEffect, useState } from 'react'
import { playSfx, useFx } from './fx.tsx'

/** 후보를 하나씩 비추는 간격 (ms, 보통 속도 기준). 뒤로 갈수록 느려진다. */
const DELAYS = [70, 70, 70, 80, 90, 100, 120, 150, 190, 240, 300, 380, 500]
export const ROULETTE_MS = DELAYS.reduce((a, b) => a + b, 0)

export type RouletteState = 'before' | 'running' | 'after'

export function rouletteState(current: number, step: number): RouletteState {
  return current < step ? 'before' : current === step ? 'running' : 'after'
}

/**
 * 지금 비추고 있는 후보의 위치를 돌려준다.
 * - before : -1 (아직 시작 전)
 * - running: 후보를 훑는 중
 * - after  : 정해진 `finalIndex`
 * 후보가 하나뿐이거나 `finalIndex`를 못 찾으면 연출 없이 바로 `finalIndex`다.
 */
export function useRouletteIndex(count: number, finalIndex: number, state: RouletteState): number {
  const { speed } = useFx()
  const [k, setK] = useState(0)
  const spin = state === 'running' && count > 1 && finalIndex >= 0 && speed !== 0

  useEffect(() => {
    if (!spin) return
    setK(0)
    playSfx('tick')
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      i += 1
      if (i >= DELAYS.length) return
      setK(i)
      playSfx('tick')
      timer = setTimeout(tick, DELAYS[i] / speed)
    }
    timer = setTimeout(tick, DELAYS[0] / speed)
    return () => clearTimeout(timer)
  }, [spin, speed])

  if (state === 'before') return -1
  if (state === 'after' || !spin) return finalIndex
  const last = DELAYS.length - 1
  return (((finalIndex - (last - k)) % count) + count) % count
}
