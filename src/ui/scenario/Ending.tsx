import type { EndingTier } from '../../scenario/types.ts'
import type { ScenarioClient } from '../client.ts'
import { useEffect, useMemo } from 'react'
import { playSfx } from '../fx.tsx'
import { Appear, Beats, beatSteps, DistortContext, splitBeats, useAdvanceKey, useSequence, useSteps } from '../Narration.tsx'
import { ENDING_DISTORT } from './EndingFx.tsx'

const TIER_LABEL: Record<EndingTier, string> = { true: '진엔딩', good: '좋은 엔딩', neutral: '보통 엔딩', bad: '나쁜 엔딩' }
const TIER_CLASS: Record<EndingTier, string> = {
  true: 'text-amber',
  good: 'text-gain',
  neutral: 'text-fog',
  bad: 'text-loss',
}

/** 시나리오 엔딩: 제목 → 본문이 천천히 흐르고 → 닿은 엔딩 기록과 다음 선택 */
export function ScenarioEnding({
  client,
  onExit,
  exitLabel,
}: {
  client: ScenarioClient
  onExit: () => void
  exitLabel: string
}) {
  const { view } = client
  const ending = view.ending!

  const beats = useMemo(() => splitBeats(ending.text), [ending.text])
  const { steps, at } = useSteps(
    [['title', 0, 1600], ...beatSteps(beats), ['record', 0, 800]],
    [ending.id],
  )
  const seq = useSequence(steps)
  useAdvanceKey(seq, client.retry)
  // 엔딩의 종류에 맞는 소리가 제목이 나타날 때 한 번 난다
  useEffect(() => {
    playSfx(`ending-${ending.tier}`)
  }, [ending.id, view.runNo])

  const found = view.endings.reached.length
  const total = view.endings.total

  return (
    <section className={`ending ending-${ending.tier} py-10 text-center`} onClick={() => !seq.done && seq.skip()}>
      <Appear step={at.title} seq={seq}>
        <p className="text-xs tracking-widest text-ash">
          <span className={TIER_CLASS[ending.tier]}>{TIER_LABEL[ending.tier]}</span>
          {ending.first && <span className="ml-2 text-amber">처음 닿았다</span>}
        </p>
        <h2 className="title-card ending-title mt-2 font-serif-kr text-3xl font-bold sm:text-4xl">{ending.title}</h2>
      </Appear>

      {/* 엔딩 본문은 파티원의 정신력과 상관없이 엔딩 등급이 정한 모습으로 흐른다 */}
      <DistortContext value={ENDING_DISTORT[ending.tier]}>
        <Beats beats={beats} at={at} seq={seq} className="mx-auto mt-8 max-w-xl text-left font-serif-kr leading-9 text-fog" />
      </DistortContext>

      <Appear step={at.record} seq={seq} className="mx-auto mt-8 max-w-xl text-left">
        <p className="text-xs text-ash">
          닿아 본 엔딩 {found}/{total}
          {total > found && <span> · 아직 {total - found}개가 남았다</span>}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {view.endings.reached.map((e) => (
            <li key={e.id} className="rounded border border-edge px-2.5 py-1 text-xs">
              <span className={TIER_CLASS[e.tier]}>{e.title}</span>
              {e.count > 1 && <span className="ml-1 text-ash">×{e.count}</span>}
            </li>
          ))}
          {Array.from({ length: total - found }, (_, i) => (
            <li key={`hidden-${i}`} className="rounded border border-dashed border-edge/60 px-2.5 py-1 text-xs text-ash/50">
              ???
            </li>
          ))}
        </ul>
      </Appear>

      {seq.done && (
        <div className="rise mx-auto mt-8 flex max-w-xs flex-col gap-3">
          {client.retry && (
            <button
              type="button"
              onClick={client.retry}
              className="rounded border border-glow/50 bg-glow/10 px-6 py-3 text-sm text-glow hover:bg-glow/20"
            >
              다시 도전한다 <span className="kbd-hint ml-1 text-xs text-ash">Enter</span>
            </button>
          )}
          {client.rematch && (
            <button
              type="button"
              onClick={client.rematch}
              className="rounded border border-edge px-6 py-2.5 text-sm text-fog hover:border-fog/50"
            >
              대기실로 (대상·입사 배경 다시 고르기)
            </button>
          )}
          {!client.isHost && (
            <p className="rounded border border-edge px-4 py-3 text-sm text-ash">방장이 다시 시작하기를 기다리는 중…</p>
          )}
          <button
            type="button"
            onClick={onExit}
            className="text-xs text-ash underline-offset-2 hover:text-fog hover:underline"
          >
            {exitLabel}
          </button>
        </div>
      )}
    </section>
  )
}
