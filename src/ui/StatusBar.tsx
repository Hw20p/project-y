import { useEffect, useRef, useState } from 'react'
import { CONFIG, MONTH_BEATS } from '../engine/config.ts'
import type { GameView } from '../engine/view.ts'
import { BEAT_MARK, signed } from './format.ts'

export function StatusBar({ view }: { view: GameView }) {
  const { threat, fragments, monthNumber, beatIndex, phase, entity } = view
  const pct = Math.min(100, (threat / CONFIG.COLLAPSE_THREAT) * 100)
  const hot = pct >= 60

  // 위협도가 바뀌면 게이지가 번쩍이고 변화량이 떠올랐다 사라진다
  const prev = useRef(threat)
  const [pop, setPop] = useState<{ id: number; delta: number } | null>(null)
  useEffect(() => {
    const delta = threat - prev.current
    prev.current = threat
    if (delta === 0) return
    setPop({ id: Date.now(), delta })
    const t = setTimeout(() => setPop(null), 1400)
    return () => clearTimeout(t)
  }, [threat])

  // 진실 조각이 늘면 숫자가 반짝인다
  const prevFragments = useRef(fragments)
  const [glint, setGlint] = useState(0)
  useEffect(() => {
    if (fragments > prevFragments.current) setGlint(Date.now())
    prevFragments.current = fragments
  }, [fragments])

  return (
    <header className="border-b border-edge pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm text-fog">
          <span className="text-bone">{monthNumber}번째 달</span>
          {entity && (
            <span className="ml-2 text-ash">
              {entity.code} · {entity.name}
            </span>
          )}
        </div>
        <div className="text-sm text-fog" title="진실 조각">
          조각{' '}
          <span key={glint} className={`inline-block text-amber ${glint ? 'glint' : ''}`}>
            {fragments}
          </span>
          <span className="text-ash">/{CONFIG.TRUTH_FRAGMENTS}</span>
        </div>
      </div>

      <ol className="mt-2 flex gap-1.5" aria-label="이번 달 진행">
        {MONTH_BEATS.map((beat, i) => {
          const done = phase !== 'briefing' && i < beatIndex
          const now = phase !== 'briefing' && i === beatIndex
          return (
            <li
              key={i}
              className={`flex h-6 flex-1 items-center justify-center rounded text-xs transition-colors ${
                now ? 'bg-glow/20 text-glow' : done ? 'bg-panel text-ash' : 'border border-edge text-edge'
              }`}
            >
              {BEAT_MARK[beat]}
            </li>
          )
        })}
      </ol>

      <div className="mt-3 flex items-center gap-3">
        <span className="w-12 text-xs text-ash">위협도</span>
        <div className="relative h-1.5 flex-1 overflow-visible rounded bg-panel">
          <div
            className={`h-full rounded transition-all duration-700 ${hot ? 'bg-blood' : 'bg-glow/70'}`}
            style={{ width: `${pct}%` }}
          />
          {pop && (
            <span
              key={pop.id}
              className={`gauge-flash pointer-events-none absolute inset-0 rounded ${
                pop.delta > 0 ? 'bg-blood/70' : 'bg-gain/60'
              }`}
            />
          )}
        </div>
        <span className={`relative w-8 text-right text-xs ${hot ? 'text-loss' : 'text-fog'}`}>
          {threat}
          {pop && (
            <span
              key={pop.id}
              className={`float-up pointer-events-none absolute -top-5 right-0 text-xs font-bold ${
                pop.delta > 0 ? 'text-loss' : 'text-gain'
              }`}
            >
              {signed(pop.delta)}
            </span>
          )}
        </span>
      </div>
    </header>
  )
}
