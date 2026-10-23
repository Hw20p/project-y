// 서버 없이 브라우저에서 엔진을 직접 돌리는 어댑터. 나중에 서버용 어댑터(useRemoteGame)가 같은 모양
// `{ view, send }`를 돌려주면 화면 컴포넌트는 그대로 쓸 수 있다.
// 테스트용으로 "봇 파티원"을 둘 수 있다: 사람이 행동하면 잠시 뒤 봇이 따라 행동해서 "다른 사람을 기다리는" 화면이 나온다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { context } from '../content/index.ts'
import { createGame, nightChoicesFor, reduce, voteChoices, type GameAction } from '../engine/game.ts'
import type { GameState } from '../engine/state.ts'
import { viewFor, type ClientAction } from '../engine/view.ts'
import type { GameClient } from './client.ts'

const HUMAN = 'p1'
const SAVE_KEY = 'project-y:local-game'

interface Saved {
  state: GameState
  bots: number
}

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    return saved.state && saved.state.phase !== 'ended' ? saved : null
  } catch {
    return null
  }
}

function writeSaved(saved: Saved | null): void {
  try {
    if (saved) localStorage.setItem(SAVE_KEY, JSON.stringify(saved))
    else localStorage.removeItem(SAVE_KEY)
  } catch {
    // 저장소를 못 쓰는 환경에서는 이어하기만 안 될 뿐이다.
  }
}

function newGame(bots: number): GameState {
  const players = [
    { id: HUMAN, name: '나' },
    ...Array.from({ length: bots }, (_, i) => ({ id: `b${i + 1}`, name: `파티원 ${i + 1}` })),
  ]
  return createGame(context, { seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0, players })
}

/** 봇이 아직 해야 할 행동이 남았는지 (=아직 읽거나 고민하는 중인지) */
function botPending(state: GameState, botId: string): boolean {
  const me = state.players.find((p) => p.id === botId)!
  switch (state.phase) {
    case 'briefing':
    case 'result':
      return !state.ready.includes(botId)
    case 'vote':
      return me.alive && !state.votes[botId]
    case 'night':
      return me.alive && !state.night?.picks[botId]
    default:
      return false
  }
}

/** 봇이 지금 해야 할 행동 (없으면 null) */
function botAction(state: GameState, botId: string): GameAction | null {
  if (!botPending(state, botId)) return null
  const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]
  switch (state.phase) {
    case 'briefing':
    case 'result':
      return { type: 'ready', playerId: botId }
    case 'vote':
      return { type: 'vote', playerId: botId, choiceId: pick(voteChoices(context, state)).id }
    case 'night':
      return { type: 'night', playerId: botId, choiceId: pick(nightChoicesFor(context, state, botId)).id }
    default:
      return null
  }
}

export function useLocalGame(config: { bots: number; resume: boolean }): GameClient {
  const [state, setState] = useState<GameState>(() => {
    const saved = config.resume ? loadSaved() : null
    return saved ? saved.state : newGame(config.bots)
  })

  useEffect(() => {
    writeSaved(state.phase === 'ended' ? null : { state, bots: config.bots })
  }, [state, config.bots])

  // 봇: 장면마다 각자 따로 한동안 읽다가 행동한다 (그동안 "읽는 중"으로 보인다).
  // 다른 봇이 행동해서 상태가 바뀌어도 이미 걸어 둔 타이머는 다시 걸지 않는다.
  const scheduled = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    if (state.phase === 'ended') return
    for (const p of state.players) {
      if (p.id === HUMAN || !botPending(state, p.id)) continue
      const key = `${p.id}|${state.phase}|${state.monthNumber}|${state.month?.beatIndex}`
      if (scheduled.current.has(key)) continue
      const timer = setTimeout(() => {
        scheduled.current.delete(key)
        setState((s) => {
          const action = botAction(s, p.id)
          return action ? reduce(context, s, action) : s
        })
      }, 1200 + Math.random() * 2600)
      scheduled.current.set(key, timer)
    }
  }, [state])
  useEffect(() => {
    const timers = scheduled.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const view = useMemo(() => viewFor(context, state, HUMAN), [state])

  const send = useCallback((action: ClientAction) => {
    setState((s) => reduce(context, s, { ...action, playerId: HUMAN }))
  }, [])

  // 읽는 중: 나는 화면이 알려 주고, 봇은 아직 할 일이 남은 동안 읽는 중이다.
  const [humanReading, setReading] = useState(false)
  const reading = useMemo(() => {
    const ids = state.players.filter((p) => p.id !== HUMAN && botPending(state, p.id)).map((p) => p.id)
    return humanReading ? [HUMAN, ...ids] : ids
  }, [state, humanReading])

  return { view, send, reading, setReading }
}
