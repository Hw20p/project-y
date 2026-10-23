import { lazy, Suspense, useState } from 'react'
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '../net/protocol.ts'
import { FxProvider } from './fx.tsx'
import { Lobby } from './room/Lobby.tsx'
import { ScenarioScreen } from './scenario/ScenarioScreen.tsx'
import { loadScreen, saveScreen } from './storage.ts'
import {
  loadName,
  loadSession,
  saveName,
  useRemoteGame,
  type RemoteInit,
} from './room/useRemoteGame.ts'

/**
 * 개발 전용 화면(전수 탐색기). `import.meta.env.DEV`가 거짓인 빌드에서는 이 줄과 쓰는 곳이 통째로 지워져서
 * 탐색기·시험용 시나리오가 배포 결과물에 들어가지 않는다.
 */
const ExplorerPage = import.meta.env.DEV ? lazy(() => import('./dev/ExplorerPage.tsx')) : null

type Screen =
  | { kind: 'title' }
  | { kind: 'explorer' }
  | { kind: 'remote'; id: number; init: RemoteInit }

export default function App() {
  return (
    <FxProvider>
      <Root />
    </FxProvider>
  )
}

/** 새로 고침하면 이 탭이 있던 게임 화면으로 바로 돌아온다 (저장된 판이 아직 있을 때만) */
function initialScreen(): Screen {
  const saved = loadScreen()
  if (saved?.kind === 'remote') {
    const session = loadSession()
    if (session) return { kind: 'remote', id: Date.now(), init: { kind: 'rejoin', session } }
  }
  return { kind: 'title' }
}

function Root() {
  const [screen, setScreen] = useState<Screen>(initialScreen)

  const go = (next: Screen) => {
    saveScreen(next.kind === 'remote' ? { kind: 'remote' } : null)
    setScreen(next)
  }
  const toTitle = () => go({ kind: 'title' })

  if (screen.kind === 'explorer' && ExplorerPage) {
    return (
      <Suspense fallback={<p className="p-6 text-sm text-ash">불러오는 중…</p>}>
        <ExplorerPage onBack={toTitle} />
      </Suspense>
    )
  }
  if (screen.kind === 'remote') {
    return <RemoteGame key={screen.id} init={screen.init} onExit={toTitle} />
  }
  return (
    <Title
      onRemote={(init) => go({ kind: 'remote', id: Date.now(), init })}
      onExplorer={import.meta.env.DEV ? () => setScreen({ kind: 'explorer' }) : undefined}
    />
  )
}

// ───────────────────────── 방 ─────────────────────────

function Message({ title, text, action, onAction }: { title: string; text?: string; action: string; onAction: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <h1 className="font-serif-kr text-xl font-bold">{title}</h1>
      {text && <p className="mt-3 font-serif-kr leading-8 text-fog">{text}</p>}
      <button
        type="button"
        onClick={onAction}
        className="mx-auto mt-8 rounded border border-edge bg-panel px-6 py-2 text-sm hover:border-fog/50"
      >
        {action}
      </button>
    </div>
  )
}

function RemoteGame({ init, onExit }: { init: RemoteInit; onExit: () => void }) {
  const room = useRemoteGame(init)

  if (room.status === 'error') {
    return <Message title="들어가지 못했다" text={room.error ?? undefined} action="처음 화면으로" onAction={onExit} />
  }
  if (room.status === 'connecting' || (room.status === 'lobby' && !room.lobby)) {
    return <Message title="서버에 연결하는 중…" action="취소" onAction={onExit} />
  }
  if (room.status === 'lobby' && room.lobby) {
    return (
      <Lobby
        lobby={room.lobby}
        notice={room.notice}
        onStart={room.start}
        onMode={room.setMode}
        onArchetype={room.setArchetype}
        onLeave={() => {
          room.leave()
          onExit()
        }}
      />
    )
  }

  const leave = () => {
    room.leave()
    onExit()
  }

  if (!room.scenario) return <Message title="서버에 연결하는 중…" action="취소" onAction={onExit} />
  const sc = room.scenario
  const done = sc.view.phase === 'ended'
  return (
    <>
      <ScenarioScreen
        client={sc}
        onExit={done ? leave : onExit}
        exitLabel={done ? '방 나가기' : '처음 화면으로 (이 방에는 다시 들어올 수 있다)'}
        onLeave={done ? undefined : () => window.confirm('방을 완전히 나갈까요? 다시 들어올 수 없습니다.') && leave()}
      />
      {room.notice && (
        <p className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-loss/40 bg-ink px-4 py-2 text-sm text-loss shadow-lg">
          {room.notice}
        </p>
      )}
    </>
  )
}

// ───────────────────────── 시작 화면 ─────────────────────────

function Title({
  onRemote,
  onExplorer,
}: {
  onRemote: (init: RemoteInit) => void
  /** 개발 서버에서만 주어진다 */
  onExplorer?: () => void
}) {
  const [name, setName] = useState(loadName)
  const [code, setCode] = useState(() => {
    const fromLink = new URLSearchParams(location.search).get('room')
    return (fromLink ?? '').toUpperCase().slice(0, ROOM_CODE_LENGTH)
  })
  const session = loadSession()
  const trimmed = name.trim()

  const withName = (make: (n: string) => RemoteInit) => {
    if (!trimmed) return
    saveName(trimmed)
    onRemote(make(trimmed))
  }

  const inputCls =
    'w-full rounded border border-edge bg-ink px-3 py-2.5 text-base text-bone placeholder:text-ash/60 focus:border-glow/60 focus:outline-none sm:text-sm'

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs tracking-widest text-ash">PROJECT-Y</p>
      <h1 className="mt-2 font-serif-kr text-3xl font-bold">이상현상, 정체불명</h1>
      <p className="mt-4 font-serif-kr leading-8 text-fog">
        시설에서 대상을 조사한다. 낮에는 조사, 밤에는 개인정비. 알아낸 것은 말로 나눠야 쓸모가 생긴다.
      </p>

      <section className="mt-8 rounded border border-edge bg-panel/40 p-4">
        <h2 className="text-sm text-fog">방에 모여 시작하기 (최대 4명)</h2>
        <p className="mt-1 text-xs text-ash">혼자라면 방을 만들고 혼자 할 수 있는 대상을 고르면 된다. 여럿이라면 음성 채팅(디스코드 등)을 켜고 하는 것을 권한다.</p>

        <label className="mt-4 block text-xs text-ash">
          내 이름
          <input
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            className={`${inputCls} mt-1`}
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => withName((n) => ({ kind: 'create', name: n }))}
            className="rounded border border-glow/50 bg-glow/10 px-3 py-2.5 text-sm text-glow hover:bg-glow/20 disabled:opacity-40"
          >
            방 만들기
          </button>
          <div className="flex gap-2">
            <input
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="코드"
              aria-label="방 코드"
              className={`${inputCls} min-w-0 text-center tracking-widest`}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!trimmed || code.length !== ROOM_CODE_LENGTH}
          onClick={() => withName((n) => ({ kind: 'join', name: n, code }))}
          className="mt-2 w-full rounded border border-edge bg-panel px-3 py-2.5 text-sm hover:border-fog/50 disabled:opacity-40"
        >
          코드로 참가
        </button>

        {session && (
          <button
            type="button"
            onClick={() => onRemote({ kind: 'rejoin', session })}
            className="mt-3 w-full rounded border border-amber/40 bg-amber/5 px-3 py-2.5 text-left text-sm text-amber hover:bg-amber/10"
          >
            방 {session.code}에 다시 들어가기
          </button>
        )}
      </section>

      {import.meta.env.DEV && onExplorer && (
        <button
          type="button"
          onClick={onExplorer}
          className="mt-4 rounded border border-dashed border-amber/50 px-4 py-2.5 text-left text-sm text-amber hover:bg-amber/5"
        >
          [개발] 시나리오 전수 탐색기
          <span className="ml-2 text-xs text-amber/70">개발 서버에서만 보인다</span>
        </button>
      )}
    </div>
  )
}
