// 시나리오 결과 화면: 투표·조합·개인 행동의 결과를 단계별로 보여 준다.
import { useEffect } from 'react'
import type { ScenarioClient } from '../client.ts'
import { Appear, Typed, useAdvanceKey, useSequence, useSteps } from '../Narration.tsx'
import type { Change } from '../../scenario/state.ts'
import type { ResultView, ScenarioView } from '../../scenario/view.ts'
import { Changes, Continue, NewFacts, SkipHint } from './parts.tsx'

/** 결과가 화면에 일으키는 충격의 종류 (화면 번쩍임·효과음에 쓰인다) */
export type Impact = 'death' | 'fragment' | 'item' | 'good' | 'bad'

type Send = ScenarioClient['send']

/** 결과가 화면에 일으키는 충격: 피해는 붉게, 단서는 금빛, 아이템은 초록 */
export function impactOfChanges(changes: Change[], me: string): Impact {
  if (changes.some((c) => c.kind === 'hurt' || (c.kind === 'stat' && c.amount < 0))) return 'bad'
  if (changes.some((c) => c.kind === 'fact' && c.playerId === me)) return 'fragment'
  if (changes.some((c) => c.kind === 'item' && c.gained && c.playerId === me)) return 'item'
  return 'good'
}

/** 칩이 나타나는 순간 한 번만 화면 효과를 낸다 */
function useImpactOnce(reached: boolean, impact: Impact, onImpact: (i: Impact) => void) {
  useEffect(() => {
    if (reached) onImpact(impact)
    // 도달 여부가 바뀔 때만 다시 평가한다 (한 번만 쏜다)
  }, [reached])
}

function PickList({ view, picks, options }: { view: ScenarioView; picks: Record<string, string>; options: ResultView['options'] }) {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id
  const rows = options
    .map((o) => ({ ...o, who: Object.entries(picks).filter(([, a]) => a === o.id).map(([pid]) => name(pid)) }))
    .filter((r) => r.who.length > 0)
  if (rows.length === 0) return <p className="text-xs text-ash">아무도 행동하지 못했다.</p>
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.id} className="rounded border border-edge px-3 py-2 text-sm">
          <span className="font-serif-kr text-fog">{r.text}</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {r.who.map((w) => (
              <span key={w} className="rounded-full border border-edge px-2 py-0.5 text-xs text-fog">
                {w}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ScenarioResultPanel({
  view,
  send,
  onImpact,
}: {
  view: ScenarioView
  send: Send
  onImpact: (i: Impact) => void
}) {
  const result = view.result!
  const mineLines = (result.mine?.text ?? '').split('\n').filter(Boolean)
  const allChanges = [...result.changes, ...(result.mine?.changes ?? [])]

  const { steps, at } = useSteps(
    [
      ['head', 0, 650],
      ['who', 0, 700],
      ['mine', result.mine?.text.length ?? 0, 500],
      ['text', result.text.length, 500],
      ['chips', 0, 500],
    ],
    [],
  )
  const seq = useSequence(steps)
  useAdvanceKey(seq, () => send({ type: 'ready' }))
  useImpactOnce(seq.i >= at.chips, impactOfChanges(allChanges, view.me.id), onImpact)

  const label =
    result.kind === 'vote' ? '투표 결과' : result.kind === 'split' ? '조합 결과' : '개인 행동의 결과'

  // 투표: 선택지별 득표
  const voteRows =
    result.kind === 'vote'
      ? result.options.map((o) => ({
          ...o,
          voters: Object.entries(result.votes ?? {}).filter(([, id]) => id === o.id).map(([pid]) => view.players.find((p) => p.id === pid)?.name ?? pid),
          chosen: o.text === result.choiceText,
        }))
      : []

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Appear step={at.head} seq={seq}>
        <p className="text-xs tracking-widest text-ash">{label}</p>
        {result.kind === 'vote' && result.choiceText && !result.forcedTie && (
          <h2 className="mt-1 font-serif-kr text-lg text-fog">{result.choiceText}</h2>
        )}
        {result.forcedTie && <p className="mt-1 text-xs text-amber">동률이라 방장의 표를 따랐다.</p>}
      </Appear>

      <Appear step={at.who} seq={seq} className="mt-3">
        {result.kind === 'vote' && (
          <ul className="space-y-2">
            {voteRows.map((r) => (
              <li
                key={r.id}
                className={`rounded border px-3 py-2 text-sm transition ${
                  r.chosen ? 'border-gain/60 bg-gain/10' : 'border-edge opacity-55'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-serif-kr">{r.text}</span>
                  {r.chosen && <span className="shrink-0 text-xs text-gain">선택됨</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-ash">{r.voters.length}표</span>
                  {r.voters.map((w) => (
                    <span key={w} className="rounded-full border border-edge px-2 py-0.5 text-xs text-fog">
                      {w}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {result.kind !== 'vote' && result.picks && <PickList view={view} picks={result.picks} options={result.options} />}
      </Appear>

      {mineLines.length > 0 && (
        <div className="mt-5 rounded border border-glow/30 bg-glow/5 p-4">
          <p className="text-xs tracking-widest text-glow">내가 본 것 · 나만 안다</p>
          <div className="mt-2 space-y-1.5 font-serif-kr leading-8">
            {mineLines.length === 1 ? (
              <p>
                <Typed text={mineLines[0]} step={at.mine} seq={seq} />
              </p>
            ) : (
              mineLines.map((l, i) => (
                <p key={i} className={seq.i < at.mine ? 'invisible' : 'text-fog'}>
                  {l}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {result.text && (
        <p
          className={`mt-4 border-l-2 border-edge pl-3 font-serif-kr leading-8 ${
            seq.i < at.text ? 'invisible' : 'text-bone'
          }`}
        >
          <Typed text={result.text} step={at.text} seq={seq} />
        </p>
      )}

      <Appear step={at.chips} seq={seq}>
        <Changes changes={allChanges} view={view} />
        <NewFacts changes={allChanges} view={view} />
      </Appear>

      {seq.done ? <Continue view={view} onClick={() => send({ type: 'ready' })} /> : <SkipHint />}
    </section>
  )
}
