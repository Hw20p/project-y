// 시나리오 모드의 게임 화면: 상단(시계·판 번호·엔딩 진행)·파티(스텟)·장면·정보 패널.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stripFx } from '../../scenario/fx.ts'
import { needMoreChoiceIds, type ScenarioView } from '../../scenario/view.ts'
import { Backdrop } from '../backdrop/Backdrop.tsx'
import { ReadingContext, type ScenarioClient } from '../client.ts'
import { FxSettingsMenu, playSfx, useMusic, type BgmId } from '../fx.tsx'
import { DistortContext, distortAt } from '../Narration.tsx'
import { loadJournal, pruneJournals, saveJournal, type JournalEntry } from '../storage.ts'
import { BoardStrip } from './Board.tsx'
import { ScenarioDrawer, type ScenarioTab } from './Drawer.tsx'
import { ScenarioEnding } from './Ending.tsx'
import { EndingBackdrop } from './EndingFx.tsx'
import { LightMeter, myClues, ScenarioParty } from './parts.tsx'
import { ScenarioResultPanel, type Impact } from './Results.tsx'
import { ChoiceScene, PersonalScene, StoryScene } from './Scenes.tsx'

const SOUND_OF = { death: 'death', fragment: 'fragment', item: 'item', good: 'good', bad: 'bad', success: 'good' } as const

/** 며칠째 낮/밤인지 (시나리오가 장면에 시간대를 정해 둔 경우에만 보인다) */
function TimeChip({ view, night }: { view: ScenarioView; night: boolean }) {
  if (!view.timeOfDay) return null
  return (
    <span
      className={`whitespace-nowrap rounded border px-2 py-0.5 ${night ? 'border-glow/40 bg-glow/10 text-glow' : 'border-amber/40 bg-amber/10 text-amber'}`}
    >
      <span aria-hidden>{night ? '☾' : '☀'} </span>
      {view.timeOfDay.day !== null && `${view.timeOfDay.day}일째 `}
      {night ? '밤' : '낮'}
    </span>
  )
}

/** 결과 하나를 "지난 기록"의 한 줄로 */
function toJournal(view: ScenarioView): JournalEntry | null {
  const r = view.result
  if (!r) return null
  const label =
    r.kind === 'vote' ? `추리 · ${r.choiceText ?? ''}` : r.kind === 'split' ? (r.label ?? '조합') : '개인 행동'
  const parts = [stripFx(r.text), stripFx(r.mine?.text ?? '').replace(/\n/g, ' ')].filter(Boolean)
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
      // 지난 기록은 지금 판의 것만 남긴다 (다시 도전하면 이전 판의 기록은 버린다)
      const next = [...j.filter((e) => e.run === entry.run), entry].slice(-80)
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
      else if ((e.key === 'q' || e.key === 'Q') && view.board) toggle('board')
      else if (e.key === 'i' || e.key === 'I') toggle('entity')
      else if (e.key === 'b' || e.key === 'B' || e.key === 'n' || e.key === 'N') toggle('clues')
      else if (e.key === 'j' || e.key === 'J') toggle('journal')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view.phase, view.board])

  // 조명이 한 단계 어두워지는 순간에는 화면이 몇 번 깜빡인다 (처음 열 때나 새 판으로 시간이 되돌아갈 때는 깜빡이지 않는다)
  const lightLevel = view.light?.level ?? 0
  const lastLevel = useRef(lightLevel)
  const [blink, setBlink] = useState(0)
  useEffect(() => {
    if (lightLevel > lastLevel.current) {
      setBlink(Date.now())
      playSfx(view.light && lightLevel >= view.light.max ? 'blackout' : 'dim')
    }
    lastLevel.current = lightLevel
  }, [lightLevel, view.light])

  // 조명이 아닌 시계("남은 밤")가 한 칸 흐르는 순간: 새벽이 가까워지는 소리 (처음 열 때나 새 판으로 되돌아갈 때는 소리 없이)
  const meterLevel = view.meter?.level ?? 0
  const lastMeter = useRef(meterLevel)
  useEffect(() => {
    if (meterLevel > lastMeter.current) playSfx('dawn')
    lastMeter.current = meterLevel
  }, [meterLevel])

  // 낮과 밤이 바뀌는 순간 (처음 열 때는 소리 없이)
  const period = view.timeOfDay?.period ?? null
  const lastPeriod = useRef(period)
  useEffect(() => {
    if (period && lastPeriod.current && period !== lastPeriod.current) playSfx(period === 'night' ? 'dusk' : 'dawn')
    lastPeriod.current = period
  }, [period])

  // 정보 패널을 여닫는 소리
  const drawerOpen = drawer !== null
  const lastDrawer = useRef(drawerOpen)
  useEffect(() => {
    if (drawerOpen !== lastDrawer.current) playSfx(drawerOpen ? 'open' : 'close')
    lastDrawer.current = drawerOpen
  }, [drawerOpen])

  // 분위기: 가장 약한 사람의 정신력이 낮을수록 가장자리가 붉어진다
  const lowest = Math.min(...view.players.map((p) => p.stats.sanity))
  const danger = Math.min(1, Math.max(0, (4 - lowest) / 4))
  // 내 본문은 내 정신력만큼 번지고 갈라진다
  const mySanity = view.players.find((p) => p.id === view.me.id)?.stats.sanity ?? lowest
  const distort = useMemo(() => distortAt(mySanity), [mySanity])

  const ended = view.phase === 'ended'
  // 조명이 어두워진 정도(0~1): 화면이 가라앉는 만큼 글자는 야광처럼 빛난다
  const darkness = view.light && !ended ? Math.min(1, view.light.level / view.light.max) ** 0.9 : 0
  const night = view.timeOfDay?.period === 'night'
  // 배경음: 엔딩 > 조명이 많이 어두움 > 밤 > 낮 (파일이 없는 곡은 조용하다)
  const track: BgmId = ended ? 'ending' : darkness >= 0.5 ? 'dark' : night ? 'night' : 'day'
  useMusic(track)
  const sceneKey = `${view.runNo}-${view.time}-${view.phase}-${view.scene?.title ?? ''}-${view.scene?.text.length ?? 0}`
  const resultKey = `${view.runNo}-${view.result?.nodeId}-${view.time}`

  const waiting =
    !ended &&
    view.players.length > 1 &&
    (needMoreChoiceIds(view.scene).length > 0 || // 함께할 사람이 모자란 행동이 있어서 멈춘 경우
      view.players.some((p) => {
        if (p.id === view.me.id || online[p.id] === false) return false
        if (view.phase === 'story' || view.phase === 'result') return !p.ready
        if (view.phase === 'personal') return p.progress !== 'done'
        return !p.acted
      }))

  return (
    <ReadingContext value={setReading}>
     <DistortContext value={distort}>
      {view.backdrop && (
        // 배경 그림: 이야기 속 장소 × 낮밤 × 이야기가 정한 어둠(정전). 엔딩에서는 밤 모습으로 가라앉는다.
        <Backdrop
          scenarioId={view.scenario.id}
          place={view.backdrop.place}
          look={view.backdrop.dark ? 'dark' : night || ended ? 'night' : 'day'}
        />
      )}
      {view.timeOfDay && <div className="night-tint" style={{ opacity: night && !ended ? 1 : 0 }} aria-hidden />}
      {/* 엔딩에서는 붉은 가장자리를 등급별 연출(EndingBackdrop)이 대신한다 */}
      <div className="vignette" style={{ opacity: ended ? 0 : danger }} aria-hidden />
      {ended && view.ending && (
        <EndingBackdrop key={`${view.runNo}-${view.ending.id}`} tier={view.ending.tier} />
      )}
      {view.light && !ended && (
        // 조명이 어두워질수록 화면 가장자리부터 깊게 가라앉는다
        <div className="light-dim" style={{ opacity: darkness }} aria-hidden />
      )}
      {view.meter && !ended && (
        // 새벽이 가까울수록 화면 아래에서 희끄무레한 빛이 차오른다 (정산이 다가온다)
        <div className="dawn-glow" style={{ opacity: meterLevel / view.meter.max }} aria-hidden />
      )}
      {!ended && (
        // 배경 안개: 낮에는 따뜻한 먼지빛이, 밤에는 차가운 푸른 안개가 천천히 흐른다 (엔딩에서는 엔딩 연출이 대신한다)
        <>
          <div className="ambient-fog" style={{ opacity: night ? 0 : 1 }} aria-hidden />
          <div className="ambient-fog ambient-fog-night" style={{ opacity: night ? 1 : 0 }} aria-hidden />
        </>
      )}
      {blink > 0 && <div key={blink} className="light-blink" aria-hidden />}
      {impact && <div key={impact.id} className={`impact impact-${impact.kind}`} aria-hidden />}

      {/* 위쪽 막대: 스크롤해도 항상 보인다. 연출 막(비네트·밤 색조)보다 위, 정보 패널보다 아래에 둔다. */}
      <nav
        aria-label="메뉴"
        className="sticky top-0 z-[22] border-b border-edge/80 bg-ink/85 pt-[env(safe-area-inset-top)] shadow-[0_6px_16px_-10px_rgba(0,0,0,0.9)] backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2">
          {!ended && (
            <div className="flex min-w-0 flex-1 gap-1.5 sm:flex-none">
              {(
                [
                  ...(view.board ? ([['board', '조사 보드', 'Q', view.board.questions.filter((q) => q.solved).length]] as const) : []),
                  ['clues', '단서·소지품', 'N', view.me.items.length + myClues(view).length],
                  ['entity', '자료', 'I', 0],
                ] as const
              ).map(([id, label, key, count]) => {
                const on = drawer === id || (id === 'entity' && drawer === 'journal')
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDrawer(id)}
                    aria-pressed={on}
                    className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-1 py-2 text-xs transition sm:flex-none sm:px-3 sm:py-1.5 ${
                      on
                        ? 'border-glow/50 bg-glow/15 text-glow'
                        : 'border-edge bg-panel/70 text-fog hover:border-fog/50 hover:bg-panel hover:text-bone'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className="rounded-full bg-glow/20 px-1.5 text-[10px] leading-4 text-glow">{count}</span>
                    )}
                    <kbd className="hidden rounded border border-edge/80 px-1 font-sans text-[10px] leading-4 text-ash/80 sm:inline">{key}</kbd>
                  </button>
                )
              })}
            </div>
          )}
          {/* 시간대와 조명은 넓은 화면에서는 이 막대에 고정해 두고, 좁은 화면에서는 아래 머리글에 둔다 */}
          {!ended && (
            <div className="ml-auto hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-xs sm:flex">
              <TimeChip view={view} night={night} />
              <LightMeter view={view} compact />
            </div>
          )}
          <div className={ended ? 'ml-auto' : ''}>
            <FxSettingsMenu />
          </div>
        </div>
      </nav>

      <div
        className={`relative z-[1] mx-auto max-w-2xl px-4 pb-16 pt-3 ${impact?.kind === 'death' ? 'shake' : ''} ${darkness > 0 ? 'light-glow' : ''}`}
        style={darkness > 0 ? ({ '--glow': darkness } as React.CSSProperties) : undefined}
      >

        {reconnecting && (
          <p className="mb-3 rounded border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            연결이 끊겼다. 다시 붙는 중…
          </p>
        )}

        {!ended && (
          <header className="border-b border-edge pb-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-bone">
                {view.scenario.code} · {view.scenario.name}
              </span>
              <span className="text-xs text-ash">
                <span className="hidden sm:inline">닿아 본 엔딩 {view.endings.reached.length}/{view.endings.total} · </span>방 코드{' '}
                <span className="tracking-widest text-fog">{roomCode}</span>
              </span>
            </div>
            {/* 넓은 화면: 시간대와 칸은 위쪽 고정 막대에 있고, 시계의 문장(오염·조명 상태)은 여기에 보인다 */}
            {(view.light || view.meter) && (
              <p className={`mt-1 hidden text-xs sm:block ${view.light && view.light.max - view.light.level <= 1 ? 'fx-flicker text-loss' : 'text-ash'}`}>
                {view.light?.name ? `${view.light.name}: ` : ''}
                {view.clockLabel}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 text-xs sm:hidden">
              <span className="flex flex-wrap items-center gap-1.5">
                <TimeChip view={view} night={night} />
                <LightMeter view={view} />
              </span>
              <span className="text-ash">
                닿아 본 엔딩 {view.endings.reached.length}/{view.endings.total}
              </span>
            </div>
          </header>
        )}

        {!ended && view.board && <BoardStrip board={view.board} onOpen={() => setDrawer('board')} />}

        {!ended && <ScenarioParty view={view} reading={reading} online={online} />}

        {isHost && force && waiting && (
          <div className="-mt-1 mb-2 text-right">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('아직 안 끝낸 사람을 기다리지 않고 진행할까요?')) force()
              }}
              className="text-xs text-ash underline-offset-2 hover:text-fog hover:underline"
            >
              기다리지 않고 진행 (방장)
            </button>
          </div>
        )}

        <main className="mt-2">
          {/* 장면이 바뀔 때마다 부드럽게 나타난다 (키가 바뀌면 다시 그려진다) */}
          <div key={ended ? 'ended' : view.phase === 'result' ? resultKey : sceneKey} className="scene-in">
            {view.phase === 'story' && view.scene && <StoryScene key={sceneKey} view={view} send={send} onImpact={onImpact} />}
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
          </div>
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
        <ScenarioDrawer view={view} journal={journal.filter((e) => e.run === view.runNo)} tab={drawer} onTab={setDrawer} onClose={() => setDrawer(null)} />
      )}
     </DistortContext>
    </ReadingContext>
  )
}
