import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIG } from '../engine/config.ts'
import type { GameView } from '../engine/view.ts'
import { Briefing } from './Briefing.tsx'
import { ReadingContext, type GameClient } from './client.ts'
import { EndingScreen } from './Ending.tsx'
import { FxSettingsBar, playSfx } from './fx.tsx'
import { BEAT_LABEL } from './format.ts'
import { InfoDrawer, type DrawerTab } from './InfoDrawer.tsx'
import { type JournalEntry } from './Journal.tsx'
import { Party } from './Party.tsx'
import { ResultPanel, type Impact } from './Result.tsx'
import { Scene } from './Scene.tsx'
import { StatusBar } from './StatusBar.tsx'

function toJournal(view: GameView): JournalEntry | null {
  const r = view.result
  if (!r) return null
  const base = { month: view.monthNumber }
  if (r.kind === 'team') {
    return {
      ...base,
      key: `${view.monthNumber}:${view.beatIndex}`,
      label: `${r.beat === 'decision' ? '결정' : BEAT_LABEL[r.beat]} · ${r.choiceText}`,
      line: r.text,
      tone: r.success ? 'ok' : 'bad',
    }
  }
  if (r.kind === 'night') {
    const mine = r.entries.find((e) => e.self)
    if (!mine || !mine.self || !mine.choiceId) return null
    return {
      ...base,
      key: `${view.monthNumber}:${view.beatIndex}`,
      label: `밤 · ${mine.choiceText}`,
      line: mine.text,
      tone: mine.success ? 'ok' : 'bad',
    }
  }
  return null
}

/** 방장이 "기다리지 않고 진행"을 쓸 만한 상황인지: 아직 할 일을 안 마친 파티원이 있다 */
function waitingOnOthers(view: GameView): boolean {
  if (view.players.length < 2) return false
  switch (view.phase) {
    case 'briefing':
    case 'result':
      return view.players.some((p) => p.id !== view.me.id && !p.ready)
    case 'vote':
    case 'night':
      return view.players.some((p) => p.id !== view.me.id && p.alive && !p.acted)
    default:
      return false
  }
}

const SOUND_OF: Record<Impact, Parameters<typeof playSfx>[0]> = {
  death: 'death',
  fragment: 'fragment',
  item: 'item',
  good: 'good',
  bad: 'bad',
}

export function GameScreen({
  client,
  onExit,
  exitLabel,
  onLeave,
}: {
  client: GameClient
  onExit: () => void
  exitLabel: string
  /** 온라인 방에서 자리를 완전히 비우고 나가기 (없으면 버튼을 보이지 않는다) */
  onLeave?: () => void
}) {
  const { view, send, reading, setReading, online, roomCode, isHost, reconnecting, force } = client
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const seen = useRef(new Set<string>())

  useEffect(() => {
    const entry = toJournal(view)
    if (!entry || seen.current.has(entry.key)) return
    seen.current.add(entry.key)
    setJournal((j) => [...j, entry].slice(-60))
  }, [view])

  // 화면 효과: 결과가 일으키는 충격(번쩍임·흔들림·소리)
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

  // 정보 패널: 대상 정보·소지품·지난 기록은 언제든 열어 볼 수 있다 (I / B / J, 닫기 Esc)
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') setDrawer(null)
      else if (view.phase === 'ended') return
      else if (e.key === 'i' || e.key === 'I') setDrawer((d) => (d === 'entity' ? null : 'entity'))
      else if (e.key === 'b' || e.key === 'B') setDrawer((d) => (d === 'bag' ? null : 'bag'))
      else if (e.key === 'j' || e.key === 'J') setDrawer((d) => (d === 'journal' ? null : 'journal'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view.phase])

  // 분위기: 위협도가 높을수록 가장자리가 붉어지고, 밤에는 푸르게 가라앉는다
  const danger = Math.min(1, Math.max(0, (view.threat - 35) / (CONFIG.COLLAPSE_THREAT - 35)))
  const night = view.phase !== 'ended' && view.phase !== 'briefing' && view.beat === 'night'

  const sceneKey = `${view.monthNumber}-${view.beatIndex}`

  return (
    <ReadingContext value={setReading}>
      <div className="vignette" style={{ opacity: danger }} aria-hidden />
      <div className="night-tint" style={{ opacity: night ? 1 : 0 }} aria-hidden />
      {impact && <div key={impact.id} className={`impact impact-${impact.kind}`} aria-hidden />}

      <div className={`mx-auto max-w-2xl px-4 pb-16 pt-5 ${impact?.kind === 'death' ? 'shake' : ''}`}>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {view.phase !== 'ended' ? (
            <div className="grid grid-cols-3 gap-1.5 sm:flex">
              {(
                [
                  ['entity', '대상 정보', 'I', 0],
                  ['bag', '소지품', 'B', view.me.items.length + view.me.hints.length],
                  ['journal', '지난 기록', 'J', journal.length],
                ] as const
              ).map(([id, label, key, count]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDrawer(id)}
                  className="rounded border border-edge bg-panel/60 px-2.5 py-2 text-center text-sm text-fog hover:border-fog/50 hover:text-bone sm:py-1 sm:text-xs"
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
        {roomCode && view.phase !== 'ended' && (
          <p className="mb-2 text-xs text-ash">
            방 코드 <span className="tracking-widest text-fog">{roomCode}</span>
          </p>
        )}

        {view.phase !== 'ended' && <StatusBar view={view} />}
        {view.phase !== 'ended' && <Party view={view} reading={reading} online={online} />}
        {isHost && force && waitingOnOthers(view) && (
          <div className="-mt-1 mb-2 text-right">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('아직 안 고른 사람을 기다리지 않고 진행할까요?')) force()
              }}
              className="text-xs text-ash underline-offset-2 hover:text-fog hover:underline"
            >
              기다리지 않고 진행 (방장)
            </button>
          </div>
        )}

        <main className="mt-2">
          {view.phase === 'briefing' && <Briefing key={sceneKey} view={view} send={send} />}
          {(view.phase === 'vote' || view.phase === 'night') && view.scene && (
            <Scene key={sceneKey} view={view} send={send} />
          )}
          {view.phase === 'result' && view.result && (
            <ResultPanel
              key={`${sceneKey}-${view.result.kind}`}
              view={view}
              send={send}
              onImpact={onImpact}
            />
          )}
          {view.phase === 'ended' && <EndingScreen view={view} onRestart={onExit} />}
        </main>

        {view.phase !== 'ended' && (
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

      {drawer && view.phase !== 'ended' && (
        <InfoDrawer
          view={view}
          journal={journal}
          tab={drawer}
          onTab={setDrawer}
          onClose={() => setDrawer(null)}
        />
      )}
    </ReadingContext>
  )
}
