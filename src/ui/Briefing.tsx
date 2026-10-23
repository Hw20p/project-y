import type { ClientAction, GameView } from '../engine/view.ts'
import { ContinueButton } from './ContinueButton.tsx'
import { Appear, Typed, useAdvanceKey, useSequence, useSteps } from './Narration.tsx'

const TYPE_LABEL: Record<string, string> = { creature: '생명체', place: '장소', object: '물건' }

/** 새 대상 소개: 제목 카드 → 외형 → 관찰 기록과 매뉴얼이 한 줄씩 */
export function Briefing({ view, send }: { view: GameView; send: (a: ClientAction) => void }) {
  const e = view.entity!

  const { steps, at } = useSteps(
    [
      ['head', 0, 1100],
      ['summary', e.summary.length, 500],
      ...e.observation.map((_, i): [string, number, number] => [`o${i}`, 0, 700]),
      ...e.manual.map((_, i): [string, number, number] => [`m${i}`, 0, 700]),
    ],
    [e.code],
  )
  const seq = useSequence(steps)
  useAdvanceKey(seq, () => send({ type: 'ready' }))

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Appear step={at.head} seq={seq}>
        <p className="title-card text-xs tracking-widest text-ash">
          {view.monthNumber}번째 달 · 새 대상 · {TYPE_LABEL[e.type] ?? e.type}
        </p>
        <h2 className="title-card mt-2 font-serif-kr text-2xl font-bold sm:text-3xl">
          <span className="mr-3 text-ash">{e.code}</span>
          {e.name}
        </h2>
      </Appear>

      <p className="mt-4 font-serif-kr leading-8 text-bone">
        <Typed text={e.summary} step={at.summary} seq={seq} />
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {seq.i >= at.o0 && (
          <div className="rise rounded border border-edge bg-panel/60 p-4">
            <h3 className="mb-2 text-xs text-ash">관찰 기록</h3>
            <ul className="space-y-2 font-serif-kr text-sm leading-7 text-fog">
              {e.observation.map((t, i) => (
                <Appear key={i} step={at[`o${i}`]} seq={seq}>
                  <li>· {t}</li>
                </Appear>
              ))}
            </ul>
          </div>
        )}
        {seq.i >= at.m0 && (
          <div className="rise rounded border border-edge bg-panel/60 p-4">
            <h3 className="mb-2 text-xs text-ash">관리 매뉴얼</h3>
            <ul className="space-y-2 font-serif-kr text-sm leading-7 text-fog">
              {e.manual.map((t, i) => (
                <Appear key={i} step={at[`m${i}`]} seq={seq}>
                  <li>· {t}</li>
                </Appear>
              ))}
            </ul>
          </div>
        )}
      </div>

      {seq.done ? (
        <ContinueButton view={view} send={send} label="조사를 시작한다" />
      ) : (
        <p className="mt-6 text-xs text-ash/70">화면을 누르면 건너뛴다</p>
      )}
    </section>
  )
}
