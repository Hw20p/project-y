// 서술이 한 줄씩, 한 글자씩 흘러나오게 하는 장치.
// 화면은 "단계(step)" 목록을 만들고, 훅이 지금 몇 번째 단계가 어디까지 보이는지 알려 준다.
//  - chars > 0 : 글자가 하나씩 찍히는 문장
//  - chars = 0 : 통째로 나타나는 줄/블록 (아이콘 줄, 선택지 등)
// 어디든 누르거나 Enter를 누르면 끝까지 건너뛴다. 속도는 설정(보통·빠름·즉시)을 따른다.
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ReadingContext } from './client.ts'
import { useFx } from './fx.tsx'

export interface Step {
  chars: number
  /** 이 단계가 끝나고 다음으로 넘어가기 전의 여유 (ms, 보통 속도 기준) */
  pause?: number
}

const CHAR_MS = 28
const DEFAULT_PAUSE = 380

export interface Seq {
  /** 지금 진행 중인 단계 (모두 끝나면 steps.length) */
  i: number
  /** 지금 단계에서 보이는 글자 수 */
  c: number
  done: boolean
  skip: () => void
}

export function useSequence(steps: Step[]): Seq {
  const { speed } = useFx()
  const [pos, setPos] = useState({ i: 0, c: 0 })
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const total = steps.length

  useEffect(() => {
    const list = stepsRef.current
    if (pos.i >= list.length) return
    if (speed === 0) {
      setPos({ i: list.length, c: 0 })
      return
    }
    const step = list[pos.i]
    if (pos.c < step.chars) {
      const t = setTimeout(() => setPos((p) => ({ i: p.i, c: p.c + 1 })), CHAR_MS / speed)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setPos((p) => ({ i: p.i + 1, c: 0 })), (step.pause ?? DEFAULT_PAUSE) / speed)
    return () => clearTimeout(t)
  }, [pos, speed, total])

  const skip = useCallback(() => setPos({ i: stepsRef.current.length, c: 0 }), [])
  const done = pos.i >= total

  // 서술이 흐르는 동안 "읽는 중"이라고 파티원에게 알린다 (건너뛰거나 다 흐르면 해제)
  const report = useContext(ReadingContext)
  useEffect(() => {
    report?.(!done)
    return () => report?.(false)
  }, [done, report])

  return { i: pos.i, c: pos.c, done, skip }
}

/** 단계 목록을 이름으로 다룬다: `build([['head', 0], ['story', 40]])` → steps와 `at.story` (= 1) */
export function buildSteps<K extends string>(list: [K, number, number?][]): {
  steps: Step[]
  at: Record<K, number>
} {
  const at = {} as Record<K, number>
  const steps = list.map(([name, chars, pause], idx) => {
    at[name] = idx
    return { chars, pause }
  })
  return { steps, at }
}

export function useSteps<K extends string>(list: [K, number, number?][], deps: unknown[]) {
  // 호출하는 쪽이 내용이 바뀔 때만 deps를 바꾼다
  return useMemo(() => buildSteps(list), deps)
}

/** 한 글자씩 찍히는 문장. 아직 안 찍힌 부분도 자리를 차지해서 줄이 흔들리지 않는다. */
export function Typed({ text, step, seq }: { text: string; step: number; seq: Seq }) {
  if (seq.i < step) return <span className="invisible">{text}</span>
  const n = seq.i > step ? text.length : seq.c
  return (
    <>
      <span>{text.slice(0, n)}</span>
      <span className="invisible">{text.slice(n)}</span>
    </>
  )
}

/** 해당 단계에 닿은 뒤에만 나타나는 블록 */
export function Appear({
  step,
  seq,
  className = '',
  children,
}: {
  step: number
  seq: Seq
  className?: string
  children: ReactNode
}) {
  if (seq.i < step) return null
  return <div className={`rise ${className}`}>{children}</div>
}

/**
 * 건너뛰기 + 키 입력. 서술이 흐르는 동안 Enter/Space는 건너뛰기이고, 다 흐른 뒤의 Enter는 `onEnter`다.
 * (서술을 읽기 전에 실수로 "계속"이 눌리지 않게 한다.)
 */
export function useAdvanceKey(seq: Seq, onEnter?: () => void): void {
  const ref = useRef({ seq, onEnter })
  ref.current = { seq, onEnter }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
      if (e.key !== 'Enter' && e.key !== ' ') return
      const { seq: s, onEnter: enter } = ref.current
      if (!s.done) {
        e.preventDefault()
        s.skip()
      } else if (enter && e.key === 'Enter') {
        e.preventDefault()
        enter()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
