import { endings } from '../content/endings.ts'
import type { GameView } from '../engine/view.ts'
import { Appear, Typed, useAdvanceKey, useSequence, useSteps } from './Narration.tsx'

/** 엔딩: 암전 속에서 제목 → 본문이 천천히 흐르고 → 기록과 버튼 */
export function EndingScreen({ view, onRestart }: { view: GameView; onRestart: () => void }) {
  const ending = view.ending!
  const text = endings[ending.id]

  const { steps, at } = useSteps(
    [
      ['title', 0, 1600],
      ['body', text.text.length, 900],
      ['stats', 0, 800],
    ],
    [ending.id],
  )
  const seq = useSequence(steps)
  useAdvanceKey(seq, onRestart)

  return (
    <section className="py-10 text-center" onClick={() => !seq.done && seq.skip()}>
      <Appear step={at.title} seq={seq}>
        <p className="text-xs tracking-widest text-ash">엔딩</p>
        <h2 className="title-card mt-2 font-serif-kr text-3xl font-bold sm:text-4xl">{text.title}</h2>
      </Appear>
      <p className="mx-auto mt-8 max-w-xl text-left font-serif-kr leading-9 text-fog">
        <Typed text={text.text} step={at.body} seq={seq} />
      </p>
      <Appear step={at.stats} seq={seq} className="mt-6">
        <p className="text-sm text-ash">
          {ending.month}번째 달 · 진실 조각 {view.fragments} · 위협도 {view.threat}
        </p>
      </Appear>
      {seq.done && (
        <button
          type="button"
          onClick={onRestart}
          className="rise mt-8 rounded border border-glow/50 bg-glow/10 px-6 py-2 text-sm text-glow hover:bg-glow/20"
        >
          처음으로
        </button>
      )}
    </section>
  )
}
