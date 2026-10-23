// 서술이 한 줄씩, 한 글자씩 흘러나오게 하는 장치.
// 화면은 "단계(step)" 목록을 만들고, 훅이 지금 몇 번째 단계가 어디까지 보이는지 알려 준다.
//  - chars > 0 : 글자가 하나씩 찍히는 문장 (마침표·쉼표 뒤에서는 잠깐 숨을 쉰다)
//  - chars = 0 : 통째로 나타나는 줄/블록 (아이콘 줄, 선택지 등)
// 본문 글 안의 `[[효과|글자]]`는 그 글자에만 떨림·속삭임·깜빡임 같은 효과를 입힌다 (`scenario/fx.ts`).
// 어디든 누르거나 Enter를 누르면 끝까지 건너뛴다. 속도는 설정(보통·빠름·즉시)을 따른다.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parseFx, type FxSpan } from '../scenario/fx.ts'
import { ReadingContext } from './client.ts'
import { useFx } from './fx.tsx'

export interface Step {
  chars: number
  /** 이 단계가 끝나고 다음으로 넘어가기 전의 여유 (ms, 보통 속도 기준) */
  pause?: number
  /** 찍히는 글. 있으면 마침표·쉼표 뒤에서 잠깐 더 쉰다. */
  text?: string
}

/** 단계 목록의 한 줄: [이름, 글자 수, 끝난 뒤 여유, 글] */
export type StepSpec<K extends string = string> = [K, number, number?, string?]

const CHAR_MS = 28
const DEFAULT_PAUSE = 380
/** 이 글자를 찍은 뒤 다음 글자까지 더 쉬는 시간 (ms, 보통 속도 기준): 서술에 박자가 생긴다 */
const BREATH_MS: Record<string, number> = { '.': 260, '!': 260, '?': 260, '…': 320, ',': 110, '—': 160 }

/** 정신력이 낮은 사람의 본문이 어긋나 보이게 할지 (화면 위에서 한 번 정한다) */
export const DistortContext = createContext(false)

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
      const prev = pos.c > 0 ? step.text?.[pos.c - 1] : undefined
      const breath = prev ? (BREATH_MS[prev] ?? 0) : 0
      const t = setTimeout(() => setPos((p) => ({ i: p.i, c: p.c + 1 })), (CHAR_MS + breath) / speed)
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
export function buildSteps<K extends string>(list: StepSpec<K>[]): {
  steps: Step[]
  at: Record<K, number>
} {
  const at = {} as Record<K, number>
  const steps = list.map(([name, chars, pause, text], idx) => {
    at[name] = idx
    return { chars, pause, text }
  })
  return { steps, at }
}

export function useSteps<K extends string>(list: StepSpec<K>[], deps: unknown[]) {
  // 호출하는 쪽이 내용이 바뀔 때만 deps를 바꾼다
  return useMemo(() => buildSteps(list), deps)
}

/** 한 글자씩 찍히는 문장. 아직 안 찍힌 부분도 자리를 차지해서 줄이 흔들리지 않는다. `spans`가 있으면 그 범위에 글자 효과를 입힌다. */
export function Typed({ text, step, seq, spans }: { text: string; step: number; seq: Seq; spans?: FxSpan[] }) {
  if (seq.i < step) return <span className="invisible">{text}</span>
  const n = seq.i > step ? text.length : seq.c
  if (!spans || spans.length === 0) {
    return (
      <>
        <span>{text.slice(0, n)}</span>
        <span className="invisible">{text.slice(n)}</span>
      </>
    )
  }
  // 효과가 걸린 범위와 아닌 범위로 나눠, 찍힌 만큼만 보인다
  const segs: { t: string; at: number; fx?: string }[] = []
  let pos = 0
  for (const sp of [...spans].sort((a, b) => a.start - b.start)) {
    if (sp.start > pos) segs.push({ t: text.slice(pos, sp.start), at: pos })
    segs.push({ t: text.slice(sp.start, sp.end), at: sp.start, fx: sp.fx })
    pos = sp.end
  }
  if (pos < text.length) segs.push({ t: text.slice(pos), at: pos })
  return (
    <>
      {segs.map((sg, i) => {
        const shown = Math.max(0, Math.min(sg.t.length, n - sg.at))
        return (
          <span key={i} className={sg.fx ? `fx-${sg.fx}` : undefined}>
            <span>{sg.t.slice(0, shown)}</span>
            <span className="invisible">{sg.t.slice(shown)}</span>
          </span>
        )
      })}
    </>
  )
}

/** 본문 한 토막: 한 문장씩 끊어서 차례로 흐르게 한다 */
export interface Beat {
  /** 효과 표기를 걷어 낸 글 */
  text: string
  /** 글자 효과가 걸린 범위 */
  spans: FxSpan[]
  /** 새 문단의 첫 토막인지 (앞에 여백을 둔다) */
  para: boolean
  /** 이 토막을 다 찍은 뒤 다음으로 넘어가기 전의 여유 (ms, 보통 속도 기준) */
  pause: number
}

/** 본문을 문장 단위의 토막으로 나눈다. 줄바꿈은 문단 나눔이고, 문단 끝에서는 조금 더 쉰다. 글자 효과는 문장 안에 닫혀 있어야 한다. */
export function splitBeats(text: string): Beat[] {
  const out: Beat[] = []
  for (const para of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const { plain, spans } = parseFx(para)
    // 문장 경계: 마침표류 뒤의 공백
    const ranges: [number, number][] = []
    let start = 0
    for (const m of plain.matchAll(/(?<=[.!?…])\s+/g)) {
      ranges.push([start, m.index])
      start = m.index + m[0].length
    }
    ranges.push([start, plain.length])
    const sentences = ranges.filter(([a, b]) => b > a)
    sentences.forEach(([a, b], i) => {
      const last = i === sentences.length - 1
      out.push({
        text: plain.slice(a, b),
        spans: spans
          .filter((sp) => sp.end > a && sp.start < b)
          .map((sp) => ({ fx: sp.fx, start: Math.max(sp.start, a) - a, end: Math.min(sp.end, b) - a })),
        para: i === 0 && out.length > 0,
        pause: last ? 700 : 420,
      })
    })
  }
  // 마지막 토막 뒤에는 바로 이어지는 선택지·계속 버튼이 나온다
  if (out.length > 0) out[out.length - 1].pause = 300
  return out
}

/** `splitBeats`의 토막들을 단계 `b0, b1, …`로 만든다 (뒤에 이어 붙일 단계는 `rest`). 한 화면에 본문이 둘이면 `prefix`로 이름을 나눈다. */
export function beatSteps(beats: Beat[], rest: StepSpec[] = [], prefix = 'b'): StepSpec[] {
  return [...beats.map((b, i): StepSpec => [`${prefix}${i}`, b.text.length, b.pause, b.text]), ...rest]
}

/** 토막들을 한 문단처럼 이어서 보인다. 아직 안 찍힌 토막도 자리를 차지해서 줄이 흔들리지 않는다. */
export function Beats({
  beats,
  at,
  seq,
  prefix = 'b',
  className = 'mt-3 font-serif-kr leading-8',
}: {
  beats: Beat[]
  at: Record<string, number>
  seq: Seq
  prefix?: string
  className?: string
}) {
  const distort = useContext(DistortContext)
  return (
    <p className={`${className}${distort ? ' text-distort' : ''}`}>
      {beats.map((b, i) => (
        <span key={i}>
          {b.para && <span className="mt-3 block" />}
          <Typed text={b.text} spans={b.spans} step={at[`${prefix}${i}`]} seq={seq} />
          {i < beats.length - 1 && !beats[i + 1].para && ' '}
        </span>
      ))}
    </p>
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
