// 시나리오 모드의 게임 화면: 상단(시계·판 번호·엔딩 진행)·파티(스텟)·장면·정보 패널.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScenarioView } from '../../scenario/view.ts'
import { ReadingContext, type ScenarioClient } from '../client.ts'
import { FxSettingsBar, playSfx } from '../fx.tsx'
import { loadJournal, pruneJournals, saveJournal, type JournalEntry } from '../storage.ts'
import { ScenarioDrawer, type ScenarioTab } from './Drawer.tsx'
import { ScenarioEnding } from './Ending.tsx'
import { ScenarioParty } from './parts.tsx'
import { ScenarioResultPanel, type Impact } from './Results.tsx'
import { ChoiceScene, PersonalScene, StoryScene } from './Scenes.tsx'

const SOUND_OF = { death: 'death', fragment: 'fragment', item: 'item', good: 'good', bad: 'bad' } as const

/** 결과 하나를 "지난 기록"의 한 줄로 */
function toJournal(view: ScenarioView): JournalEntry | null {
  const r = view.result
  if (!r) return null
  const label =
    r.kind === 'vote' ? `추리 · ${r.choiceText ?? ''}` : r.kind === 'split' ? '조합' : '개인 행동'
  const parts = [r.text, r.mine?.text.replace(/\n/g, ' ')].filter(Boolean)
  if (parts.length === 0) return null
  return {
    key: `${view.runNo}:${r.nodeId}:${view.time}`,
    run: view.runNo,
    label,
    line: parts.join(' '),
    tone: 'plain',
  }
}

export function ScenarioScreen({
  client,
  onExit,
  exitLabel,
  onLeave,
}: {
  client: ScenarioClient
  onExit: () => void
  exitLabel: string
  /** 자리를 완전히 비우고 나가기 (엔딩 중에는 주지 않는다) */
  onLeave?: () => void
}) {
  const { view, send, reading, setReading, online, roomCode, isHost, reconnecting, force, journalKey } = client

  // 지난 기록: 판마다 브라우저에 저장해 새로 고침해도 이어진다
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadJournal(journalKey))
  const seen = useRef(new Set(journal.map((e) => e.key)))
  useEffect(() => {
    pruneJournals()
  }, [])
  useEffect(() => {
    const entry = toJournal(view)
    if (!entry || seen.current.has(entry.key)) return
    seen.current.add(entry.key)
    setJournal((j) => {
      const next = [...j, entry].slice(-80)
      saveJournal(journalKey, next)
      return next
    })
  }, [view, journalKey])

  // 화면 효과
  const [impact, setImpact] = useState<{ id: number; kind: Impact } | null>(null)
  const onImpact = useCallback((kind: Impact) => {
    playSfx(SOUND_OF[kind])
    setImpact({ id: Date.now(), kind })
  }, [])
  useEffect(() => {
    if (!impact) return
    const t = setTimeout(() => setImpact(null), 1200)
    return () => clearTimeout(t)
  }, [impact])

  // 정보 패널
  const [drawer, setDrawer] = useState<ScenarioTab | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const toggle = (t: ScenarioTab) => setDrawer((d) => (d === t ? null : t))
      if (e.key === 'Escape') setDrawer(null)
      else if (view.phase === 'ended') return
      else if (e.key === 'i' || e.key === 'I') toggle('entity')
      else if (e.key === 'b' || e.key === 'B') toggle('bag')
      else if (e.key === 'n' || e.key === 'N') toggle('notebook')
      else if (e.key === 'j' || e.key === 'J') toggle('journal')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view.phase])

  // 분위기: 가장 약한 사람의 정신력이 낮을수록 가장자리가 붉어진다
  const lowest = Math.min(...view.players.map((p) => p.stats.sanity))
  const danger = Math.min(1, Math.max(0, (4 - lowest) / 4))

  const ended = view.phase === 'ended'
  const sceneKey = `${view.runNo}-${view.time}-${view.phase}-${view.scene?.title ?? ''}-${view.scene?.text.length ?? 0}`
  const resultKey = `${view.runNo}-${view.result?.nodeId}-${view.time}`

  const waiting =
    !ended &&
    view.players.length > 1 &&
    view.players.some((p) => {
      if (p.id === view.me.id || online[p.id] === false) return false
      if (view.phase === 'story' || view.phase === 'result') return !p.ready
      if (view.phase === 'personal') return p.progress !== 'done'
      return !p.acted
    })

  return (
    <ReadingContext value={setReading}>
      <div className="vignette" style={{ opacity: danger }} aria-hidden />
      {impact && <div key={impact.id} className={`impact impact-${impact.kind}`} aria-hidden />}

      <div className={`mx-auto max-w-2xl px-4 pb-16 pt-5 ${impact?.kind === 'death' ? 'shake' : ''}`}>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!ended ? (
            <div className="grid grid-cols-4 gap-1.5 sm:flex">
              {(
                [
                  ['entity', '대상', 'I', 0],
                  ['bag', '소지품', 'B', view.me.items.length + view.me.facts.length],
                  ['notebook', '단서', 'N', view.notebook.length],
                  ['journal', '기록', 'J', journal.length],
                ] as const
              ).map(([id, label, key, count]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDrawer(id)}
                  className="rounded border border-edge bg-panel/60 px-2 py-2 text-center text-sm text-fog hover:border-fog/50 hover:text-bone sm:px-2.5 sm:py-1 sm:text-xs"
                >
                  {label}
                  {count > 0 && <span className="ml-1 text-ash">{count}</span>}
                  <span className="ml-1.5 hidden text-ash/70 sm:inline">{key}</span>
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <FxSettingsBar />
        </div>

        {reconnecting && (
          <p className="mb-3 rounded border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            연결이 끊겼다. 다시 붙는 중…
          </p>
        )}

        {!ended && (
          <header className="border-b border-edge pb-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-bone">
                {view.scenario.code} · {view.scenario.name}
              </span>
              <span className="text-xs text-ash">
                {view.runNo}번째 판 · 방 코드 <span className="tracking-widest text-fog">{roomCode}</span>
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span className="rounded border border-amber/30 px-2 py-0.5 text-amber">{view.clockLabel}</span>
              <span className="text-ash">
                닿아 본 엔딩 {view.endings.reached.length}/{view.endings.total} · 단서 노트 {view.notebook.length}
              </span>
            </div>
          </header>
        )}

        {!ended && <ScenarioParty view={view} reading={reading} online={online} />}

        {isHost && force && waiting && (
          <div className="-mt-1 mb-2 text-right">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('아직 안 끝낸 사람을 기다리지 않고 진행할까요? (동률 투표는 방장의 표를 따른다)')) force()
              }}
              className="text-xs text-ash underline-offset-2 hover:text-fog hover:underline"
            >
              기다리지 않고 진행 (방장)
            </button>
          </div>
        )}

        <main className="mt-2">
          {view.phase === 'story' && view.scene && <StoryScene key={sceneKey} view={view} send={send} />}
          {(view.phase === 'vote' || view.phase === 'split') && view.scene && (
            <ChoiceScene key={sceneKey} view={view} send={send} reading={reading} />
          )}
          {view.phase === 'personal' && view.scene && (
            <PersonalScene key={sceneKey} view={view} send={send} reading={reading} />
          )}
          {view.phase === 'result' && view.result && (
            <ScenarioResultPanel key={resultKey} view={view} send={send} onImpact={onImpact} />
          )}
          {ended && view.ending && <ScenarioEnding client={client} onExit={onExit} exitLabel={exitLabel} />}
        </main>

        {!ended && (
          <div className="mt-10 flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={onExit}
              className="text-xs text-ash underline-offset-2 hover:text-fog hover:underline"
            >
              {exitLabel}
            </button>
            {onLeave && (
              <button
                type="button"
                onClick={onLeave}
                className="text-xs text-ash/70 underline-offset-2 hover:text-loss hover:underline"
              >
                방 완전히 나가기
              </button>
            )}
          </div>
        )}
      </div>

      {drawer && !ended && (
        <ScenarioDrawer view={view} journal={journal} tab={drawer} onTab={setDrawer} onClose={() => setDrawer(null)} />
      )}
    </ReadingContext>
  )
}
