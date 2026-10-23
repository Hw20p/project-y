import { useState } from 'react'
import { FxProvider } from './fx.tsx'
import { GameScreen } from './GameScreen.tsx'
import { loadSaved } from './useLocalGame.ts'

interface Session {
  id: number
  bots: number
  resume: boolean
}

export default function App() {
  return (
    <FxProvider>
      <Root />
    </FxProvider>
  )
}

function Root() {
  const [session, setSession] = useState<Session | null>(null)
  const [bots, setBots] = useState(0)
  const saved = session ? null : loadSaved()

  if (session) {
    return <GameScreen key={session.id} config={session} onExit={() => setSession(null)} />
  }

  const start = (resume: boolean) =>
    setSession({ id: Date.now(), bots: resume && saved ? saved.bots : bots, resume })

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs tracking-widest text-ash">PROJECT-Y</p>
      <h1 className="mt-2 font-serif-kr text-3xl font-bold">한 달에 하나, 정체불명</h1>
      <p className="mt-4 font-serif-kr leading-8 text-fog">
        시설에서 대상을 한 달씩 조사한다. 낮에는 다 같이, 밤에는 각자 움직인다. 알아낸 것은 말로 나눠야 쓸모가 생긴다.
      </p>

      <div className="mt-8 space-y-3">
        {saved && (
          <button
            type="button"
            onClick={() => start(true)}
            className="w-full rounded border border-glow/50 bg-glow/10 px-4 py-3 text-left text-glow hover:bg-glow/20"
          >
            이어하기
            <span className="ml-2 text-xs text-fog">
              {saved.state.monthNumber}번째 달 · {saved.state.players.length}명
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => start(false)}
          className="w-full rounded border border-edge bg-panel px-4 py-3 text-left hover:border-fog/50"
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
    </div>
  )
}
