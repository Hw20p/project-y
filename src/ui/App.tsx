import { useState } from 'react'
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '../net/protocol.ts'
import { FxProvider } from './fx.tsx'
import { GameScreen } from './GameScreen.tsx'
import { Lobby } from './Lobby.tsx'
import { loadSaved, useLocalGame } from './useLocalGame.ts'
import {
  loadName,
  loadSession,
  saveName,
  useRemoteGame,
  type RemoteInit,
} from './useRemoteGame.ts'

type Screen =
  | { kind: 'title' }
  | { kind: 'local'; id: number; bots: number; resume: boolean }
  | { kind: 'remote'; id: number; init: RemoteInit }

export default function App() {
  return (
    <FxProvider>
      <Root />
    </FxProvider>
  )
}

function Root() {
  const [screen, setScreen] = useState<Screen>({ kind: 'title' })
  const toTitle = () => setScreen({ kind: 'title' })

  if (screen.kind === 'local') {
    return <LocalGame key={screen.id} config={screen} onExit={toTitle} />
  }
  if (screen.kind === 'remote') {
    return <RemoteGame key={screen.id} init={screen.init} onExit={toTitle} />
  }
  return (
    <Title
      onLocal={(bots, resume) => setScreen({ kind: 'local', id: Date.now(), bots, resume })}
      onRemote={(init) => setScreen({ kind: 'remote', id: Date.now(), init })}
    />
  )
}

// ───────────────────────── 혼자 하기 ─────────────────────────

function LocalGame({
  config,
  onExit,
}: {
  config: { bots: number; resume: boolean }
  onExit: () => void
}) {
  const client = useLocalGame(config)
  return <GameScreen client={client} onExit={onExit} exitLabel="처음 화면으로 (진행 상황은 저장되어 있다)" />
}

// ───────────────────────── 함께 하기 ─────────────────────────

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
        onLeave={() => {
          room.leave()
          onExit()
        }}
      />
    )
  }

  const client = room.client!
  const ended = client.view.phase === 'ended'
  const leave = () => {
    room.leave()
    onExit()
  }
  return (
    <>
      <GameScreen
        client={client}
        onExit={ended ? leave : onExit}
        exitLabel={ended ? '방 나가기' : '처음 화면으로 (이 방에는 다시 들어올 수 있다)'}
        onLeave={ended ? undefined : () => window.confirm('방을 완전히 나갈까요? 다시 들어올 수 없습니다.') && leave()}
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
  onLocal,
  onRemote,
}: {
  onLocal: (bots: number, resume: boolean) => void
  onRemote: (init: RemoteInit) => void
}) {
  const [bots, setBots] = useState(0)
  const [name, setName] = useState(loadName)
  const [code, setCode] = useState(() => {
    const fromLink = new URLSearchParams(location.search).get('room')
    return (fromLink ?? '').toUpperCase().slice(0, ROOM_CODE_LENGTH)
  })
  const saved = loadSaved()
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
      <h1 className="mt-2 font-serif-kr text-3xl font-bold">한 달에 하나, 정체불명</h1>
      <p className="mt-4 font-serif-kr leading-8 text-fog">
        시설에서 대상을 한 달씩 조사한다. 낮에는 다 같이, 밤에는 각자 움직인다. 알아낸 것은 말로 나눠야 쓸모가 생긴다.
      </p>

      <section className="mt-8 rounded border border-edge bg-panel/40 p-4">
        <h2 className="text-sm text-fog">함께 하기 (최대 4명)</h2>
        <p className="mt-1 text-xs text-ash">음성 채팅(디스코드 등)을 켜고 하는 것을 권한다.</p>

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

      <section className="mt-4 rounded border border-edge bg-panel/40 p-4">
        <h2 className="text-sm text-fog">혼자 하기</h2>
        <div className="mt-3 space-y-2">
          {saved && (
            <button
              type="button"
              onClick={() => onLocal(saved.bots, true)}
              className="w-full rounded border border-glow/50 bg-glow/10 px-4 py-2.5 text-left text-glow hover:bg-glow/20"
            >
              이어하기
              <span className="ml-2 text-xs text-fog">
                {saved.state.monthNumber}번째 달 · {saved.state.players.length}명
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onLocal(bots, false)}
            className="w-full rounded border border-edge bg-panel px-4 py-2.5 text-left hover:border-fog/50"
          >
            새로 시작
          </button>

          <label className="flex items-center justify-between rounded border border-edge/60 px-4 py-2 text-xs text-ash">
            <span>
              테스트용 봇 파티원
              <span className="ml-1 text-ash/70">(멀티 화면 미리 보기)</span>
            </span>
            <select
              value={bots}
              onChange={(e) => setBots(Number(e.target.value))}
              className="rounded border border-edge bg-ink px-2 py-1 text-base text-fog sm:text-xs"
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}명
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </div>
  )
}
