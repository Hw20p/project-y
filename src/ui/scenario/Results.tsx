// 시나리오 결과 화면: 투표·조합·개인 행동의 결과를 단계별로 보여 준다.
import { useEffect, useMemo } from 'react'
import type { ScenarioClient } from '../client.ts'
import { Appear, Beats, beatSteps, splitBeats, useAdvanceKey, useSequence, useSteps } from '../Narration.tsx'
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
  const allChanges = [...result.changes, ...(result.mine?.changes ?? [])]

  // 고른 직후에는 해설이 먼저 흐르고(내가 본 것 → 모두에게 일어난 일), 잠시 숨을 고른 뒤에 결과(변화·새 단서)가 나온다
  const mineText = result.mine?.text ?? ''
  const mineBeats = useMemo(() => splitBeats(mineText), [mineText])
  const textBeats = useMemo(() => splitBeats(result.text), [result.text])
  const hasNarration = mineBeats.length + textBeats.length > 0
  const { steps, at } = useSteps(
    [
      ['head', 0, 650],
      ['who', 0, 700],
      ...beatSteps(mineBeats, [], 'm'),
      ...beatSteps(textBeats, [], 't'),
      ['hold', 0, hasNarration ? 800 : 0],
      ['chips', 0, 500],
    ],
    [mineText, result.text],
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

      {mineBeats.length > 0 && (
        <div className={`mt-5 rounded border border-glow/30 bg-glow/5 p-4 ${seq.i < at.m0 ? 'invisible' : ''}`}>
          <p className="text-xs tracking-widest text-glow">내가 본 것 · 나만 안다</p>
          <Beats beats={mineBeats} at={at} seq={seq} prefix="m" className="mt-2 font-serif-kr leading-8" />
        </div>
      )}

      {textBeats.length > 0 && (
        <div className={`mt-4 border-l-2 border-edge pl-3 text-bone ${seq.i < at.t0 ? 'invisible' : ''}`}>
          <Beats beats={textBeats} at={at} seq={seq} prefix="t" className="font-serif-kr leading-8" />
        </div>
      )}

      <Appear step={at.chips} seq={seq}>
        {allChanges.length > 0 && <p className="mt-5 text-xs tracking-widest text-ash">결과</p>}
        <Changes changes={allChanges} view={view} />
        <NewFacts changes={allChanges} view={view} />
      </Appear>

      {seq.done ? <Continue view={view} onClick={() => send({ type: 'ready' })} /> : <SkipHint />}
    </section>
  )
}
