// 개발 전용: 시나리오 전수 탐색기 화면. 개발 서버(npm run dev)에서만 시작 화면에 버튼이 보이고, 빌드에는 들어가지 않는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Explorer,
  type ExploreProgress,
  type ExploreReport,
  type PathStep,
  type ProblemReport,
} from '../../scenario/explore.ts'
import { partyOf, scenarios } from '../../scenario/registry.ts'
import { ARCHETYPES } from '../../scenario/stats.ts'
import type { Scenario } from '../../scenario/types.ts'
import { validateScenario } from '../../scenario/validate.ts'
import { GraphView } from './GraphView.tsx'

type Tab = 'summary' | 'paths' | 'graph' | 'problems'

const TIER_LABEL = { true: '진엔딩', good: '좋은', neutral: '보통', bad: '나쁜' } as const
const TIER_CLASS = { true: 'text-amber', good: 'text-gain', neutral: 'text-fog', bad: 'text-loss' } as const

const comboText = (c: Record<string, string | number>): string =>
  Object.keys(c).length === 0 ? '(없음)' : Object.entries(c).map(([k, v]) => `${k}=${v}`).join(', ')

function Steps({ steps }: { steps: PathStep[] }) {
  return (
    <ol className="space-y-1 text-sm">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-6 shrink-0 text-right text-xs text-ash">{i + 1}</span>
          <span className="text-fog">{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

function Problem({ title, items }: { title: string; items: ProblemReport[] }) {
  if (items.length === 0) return null
  return (
    <section className="rounded border border-loss/40 bg-loss/5 p-4">
      <h3 className="text-sm text-loss">{title}</h3>
      <div className="mt-3 space-y-5">
        {items.map((p, i) => (
          <div key={i}>
            <p className="text-xs text-ash">
              무작위 값 {comboText(p.combo)} · 해당 상태 {p.states.toLocaleString()}개 — 여기까지 가는 가장 짧은 길(예시)
            </p>
            <div className="mt-2">
              <Steps steps={p.path} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ExplorerPage({ onBack }: { onBack: () => void }) {
  const [scId, setScId] = useState(scenarios[0].id)
  const sc: Scenario = scenarios.find((s) => s.id === scId) ?? scenarios[0]
  const min = sc.party?.min ?? 1
  const max = sc.party?.max ?? 4

  const [size, setSize] = useState(Math.max(min, Math.min(2, max)))
  const count = Math.min(max, Math.max(min, size))
  const [archetypes, setArchetypes] = useState<string[]>(() => partyOf(4).map((p) => p.archetype!))
  const [maxStates, setMaxStates] = useState(100_000)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ExploreProgress | null>(null)
  const [report, setReport] = useState<ExploreReport | null>(null)
  const [reportSc, setReportSc] = useState<Scenario | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [endingId, setEndingId] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(timer.current)
    }
  }, [])

  const staticReport = useMemo(() => validateScenario(sc), [sc])

  const stop = () => {
    window.clearTimeout(timer.current)
    setRunning(false)
  }

  const start = () => {
    window.clearTimeout(timer.current)
    const players = partyOf(count).map((p, i) => ({ ...p, archetype: archetypes[i] }))
    const ex = new Explorer(sc, { players, maxStates })
    setReport(null)
    setReportSc(sc)
    setEndingId(null)
    setTab('summary')
    setRunning(true)
    // 화면이 굳지 않게 한 번에 조금씩 돌린다
    const tick = () => {
      if (!alive.current) return
      const done = ex.run(250)
      setProgress({ ...ex.progress })
      if (done) {
        setReport(ex.report())
        setRunning(false)
      } else {
        timer.current = window.setTimeout(tick, 0)
      }
    }
    tick()
  }

  const problems = report ? report.deadEnds.length + report.stuck.length : 0
  const missing = report ? report.endings.filter((e) => e.reachableCombos === 0).length : 0
  const picked = report?.endings.find((e) => e.id === endingId) ?? null

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'summary', label: '요약' },
    { id: 'paths', label: '엔딩 경로' },
    { id: 'graph', label: '분기 그래프' },
    { id: 'problems', label: '문제', badge: problems + missing },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-amber">개발 전용</p>
          <h1 className="mt-1 font-serif-kr text-2xl font-bold">시나리오 전수 탐색기</h1>
        </div>
        <button type="button" onClick={onBack} className="text-sm text-ash hover:text-bone">
          ← 처음 화면
        </button>
      </div>
      <p className="mt-2 text-sm leading-6 text-fog">
        모든 길을 실제 엔진으로 돌려서, 모든 엔딩에 닿는지·갇히는 곳이 없는지·엔딩까지 최소 몇 걸음인지 확인한다.
        판마다 바뀌는 값은 후보를 하나씩 고정해 전부 돌린다.
      </p>

      <section className="mt-5 grid gap-3 rounded border border-edge bg-panel/50 p-4 sm:grid-cols-4">
        <label className="text-xs text-ash sm:col-span-2">
          시나리오
          <select
            value={scId}
            onChange={(e) => {
              setScId(e.target.value)
              const next = scenarios.find((s) => s.id === e.target.value)
              if (next) setSize(Math.max(next.party?.min ?? 1, Math.min(2, next.party?.max ?? 4)))
            }}
            className="mt-1 w-full rounded border border-edge bg-ink px-2 py-2 text-base text-bone sm:text-sm"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ash">
          인원 ({min}~{max}명)
          <select
            value={count}
            onChange={(e) => setSize(Number(e.target.value))}
            className="mt-1 w-full rounded border border-edge bg-ink px-2 py-2 text-base text-bone sm:text-sm"
          >
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ash">
          조합당 최대 상태
          <input
            type="number"
            min={100}
            step={1000}
            value={maxStates}
            onChange={(e) => setMaxStates(Math.max(100, Number(e.target.value) || 100))}
            className="mt-1 w-full rounded border border-edge bg-ink px-2 py-2 text-base text-bone sm:text-sm"
          />
        </label>

        <div className="sm:col-span-4">
          <p className="text-xs text-ash">입사 배경 (인원이 늘면 분할 장면의 경우의 수가 크게 늘어난다)</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {Array.from({ length: count }, (_, i) => (
              <select
                key={i}
                value={archetypes[i]}
                onChange={(e) => setArchetypes((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                className="rounded border border-edge bg-ink px-2 py-1.5 text-base text-fog sm:text-xs"
              >
                {ARCHETYPES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {['가', '나', '다', '라'][i]} · {a.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:col-span-4">
          {running ? (
            <button type="button" onClick={stop} className="rounded border border-loss/50 px-5 py-2 text-sm text-loss">
              중지
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="rounded border border-glow/50 bg-glow/10 px-5 py-2 text-sm text-glow hover:bg-glow/20"
            >
              탐색 시작
            </button>
          )}
          {progress && running && (
            <span className="text-xs text-ash">
              조합 {progress.combo}/{progress.combos} · 상태 {progress.states.toLocaleString()}개 · 대기 {progress.queued.toLocaleString()}
            </span>
          )}
        </div>
      </section>

      {(staticReport.errors.length > 0 || staticReport.warnings.length > 0) && (
        <section className="mt-4 rounded border border-edge p-4 text-xs leading-6">
          <h3 className="text-sm text-fog">정적 검증</h3>
          {staticReport.errors.map((e, i) => (
            <p key={`e${i}`} className="text-loss">
              에러 · {e}
            </p>
          ))}
          {staticReport.warnings.map((w, i) => (
            <p key={`w${i}`} className="text-amber">
              경고 · {w}
            </p>
          ))}
        </section>
      )}

      {report && reportSc && (
        <div className="mt-6">
          <nav className="flex flex-wrap gap-1 border-b border-edge">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-t px-4 py-2 text-sm ${tab === t.id ? 'bg-glow/15 text-glow' : 'text-fog hover:text-bone'}`}
              >
                {t.label}
                {t.badge ? <span className="ml-1.5 rounded-full bg-loss/20 px-1.5 text-xs text-loss">{t.badge}</span> : null}
              </button>
            ))}
          </nav>

          <div className="mt-5">
            {tab === 'summary' && (
              <div className="space-y-6">
                <p className="text-sm text-fog">
                  {reportSc.code} {reportSc.name} · {report.players}명 · 무작위 값 조합 {report.combos}개 · 상태{' '}
                  {report.states.toLocaleString()}개 · {report.elapsedMs}ms
                </p>
                {report.truncated && (
                  <p className="rounded border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
                    상태가 너무 많아 일부만 봤다. "닿을 수 없다"는 결과는 확정이 아니다. 조합당 최대 상태를 늘리거나 인원을 줄여 보자.
                  </p>
                )}

                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-ash">
                    <tr>
                      <th className="py-1 pr-3 font-normal">엔딩</th>
                      <th className="py-1 pr-3 font-normal">종류</th>
                      <th className="py-1 pr-3 font-normal">닿는 조합</th>
                      <th className="py-1 font-normal">최단</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.endings.map((e) => (
                      <tr key={e.id} className="border-t border-edge/60">
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            disabled={!e.shortest}
                            onClick={() => {
                              setEndingId(e.id)
                              setTab('paths')
                            }}
                            className="text-left hover:text-glow disabled:cursor-default disabled:hover:text-bone"
                          >
                            <span className={e.reachableCombos === 0 ? 'text-loss' : e.reachableCombos < report.combos ? 'text-amber' : 'text-gain'}>
                              {e.reachableCombos === 0 ? '✗' : e.reachableCombos < report.combos ? '△' : '✓'}
                            </span>{' '}
                            {e.title}
                          </button>
                        </td>
                        <td className={`py-2 pr-3 text-xs ${TIER_CLASS[e.tier]}`}>{TIER_LABEL[e.tier]}</td>
                        <td className="py-2 pr-3 text-fog">
                          {e.reachableCombos}/{report.combos}
                        </td>
                        <td className="py-2 text-fog">{e.shortest ? `${e.shortest.steps.length}걸음` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {report.combos > 1 && (
                  <div>
                    <h3 className="text-xs text-ash">무작위 값 조합별로 닿은 엔딩</h3>
                    <ul className="mt-2 space-y-1 text-xs text-fog">
                      {report.comboSummary.map((c, i) => (
                        <li key={i}>
                          <span className="text-ash">{comboText(c.combo)}</span> — {c.endings.join(', ') || '(엔딩 없음)'} · 상태{' '}
                          {c.states.toLocaleString()}개
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.unvisitedNodes.length > 0 && (
                  <p className="text-sm text-amber">지나가지 못한 장면: {report.unvisitedNodes.join(', ')}</p>
                )}
                {report.untakenChoices.length > 0 && (
                  <p className="text-sm text-amber">고르지 못한 선택지·행동: {report.untakenChoices.join(', ')}</p>
                )}
                {problems === 0 && missing === 0 && !report.truncated && (
                  <p className="text-sm text-gain">모든 엔딩에 닿을 수 있고, 갇히는 상태도 멈추는 상태도 없다.</p>
                )}
                {problems === 0 && missing === 0 && report.truncated && (
                  <p className="text-sm text-fog">
                    모든 엔딩에 닿을 수 있다는 것은 확인했다(닿는 길을 직접 찾았으므로). 다만 일부만 본 탐색이라
                    <span className="text-amber"> 갇히는 상태가 없다는 것은 확정이 아니다</span> — 아직 안 펼친 곳이 남아 있다.
                  </p>
                )}
              </div>
            )}

            {tab === 'paths' && (
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <ul className="space-y-1">
                  {report.endings.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setEndingId(e.id)}
                        className={`w-full rounded px-3 py-2 text-left text-sm ${
                          endingId === e.id ? 'bg-glow/15 text-glow' : 'text-fog hover:bg-panel'
                        }`}
                      >
                        {e.title}
                        <span className={`ml-2 text-xs ${TIER_CLASS[e.tier]}`}>{TIER_LABEL[e.tier]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div>
                  {picked ? (
                    picked.shortest ? (
                      <>
                        <p className="text-xs text-ash">
                          가장 짧은 길 {picked.shortest.steps.length}걸음 · 무작위 값 {comboText(picked.shortest.combo)}
                        </p>
                        <div className="mt-3">
                          <Steps steps={picked.shortest.steps} />
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-loss">이 엔딩에는 어떤 길로도 닿지 못했다.</p>
                    )
                  ) : (
                    <p className="text-sm text-ash">엔딩을 골라 가장 짧은 길을 본다.</p>
                  )}
                </div>
              </div>
            )}

            {tab === 'graph' && <GraphView sc={reportSc} report={report} />}

            {tab === 'problems' && (
              <div className="space-y-5">
                {report.endings
                  .filter((e) => e.reachableCombos === 0)
                  .map((e) => (
                    <p key={e.id} className="rounded border border-loss/40 bg-loss/5 px-4 py-3 text-sm text-loss">
                      엔딩 "{e.title}"에 어떤 길로도 닿을 수 없다.
                    </p>
                  ))}
                <Problem title="갇히는 상태: 여기서는 어떤 길로도 엔딩에 닿을 수 없다" items={report.deadEnds} />
                <Problem title="진행이 멈추는 상태: 할 수 있는 행동이 없다" items={report.stuck} />
                {problems + missing === 0 && (
                  <p className={`text-sm ${report.truncated ? 'text-fog' : 'text-gain'}`}>
                    {report.truncated ? '지금까지 본 곳에서는 문제가 없다. (일부만 본 탐색이라 확정은 아니다.)' : '발견된 문제가 없다.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
