// 서버(WebSocket)에 붙어 방에 들어가고 게임을 진행하는 어댑터. 로컬 어댑터(useLocalGame)와 같은 `GameClient` 모양을 돌려준다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClientAction } from '../engine/view.ts'
import type { ClientMsg, ServerMsg } from '../net/protocol.ts'
import type { GameClient } from './client.ts'

const SESSION_KEY = 'project-y:online'
const NAME_KEY = 'project-y:name'

export interface OnlineSession {
  code: string
  token: string
  playerId: string
}

export function loadSession(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as OnlineSession) : null
  } catch {
    return null
  }
}

function saveSession(s: OnlineSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // 저장소를 못 쓰면 새로 고침 뒤 자동으로 돌아오지 못할 뿐이다.
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // 무시
  }
}

/** 서버 주소: 환경 변수 VITE_WS_URL, 없으면 같은 호스트의 8787 포트 */
function serverUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return env
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.hostname}:8787`
}

export type RemoteInit =
  | { kind: 'create'; name: string }
  | { kind: 'join'; name: string; code: string }
  | { kind: 'rejoin'; session: OnlineSession }

type LobbyMsg = Extract<ServerMsg, { t: 'lobby' }>
type StateMsg = Extract<ServerMsg, { t: 'state' }>

export interface RemoteRoom {
  status: 'connecting' | 'lobby' | 'playing' | 'error'
  error: string | null
  /** 방 안에서 받은 일시적인 거절 메시지 (잠깐 보였다 사라진다) */
  notice: string | null
  lobby: LobbyMsg | null
  /** 게임이 시작된 뒤에만 있다 */
  client: GameClient | null
  start: () => void
  /** 방을 나간다 (자리를 비우고 저장된 접속 정보도 지운다) */
  leave: () => void
}

const RETRY_MS = [1000, 2000, 4000, 8000]

export function useRemoteGame(init: RemoteInit): RemoteRoom {
  const [status, setStatus] = useState<RemoteRoom['status']>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [lobby, setLobby] = useState<LobbyMsg | null>(null)
  const [state, setState] = useState<StateMsg | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<OnlineSession | null>(init.kind === 'rejoin' ? init.session : null)
  const stoppedRef = useRef(false)

  const send = useCallback((msg: ClientMsg) => {
    const s = socketRef.current
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg))
  }, [])

  useEffect(() => {
    stoppedRef.current = false
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const fail = (message: string) => {
      stoppedRef.current = true
      saveSession(null)
      setError(message)
      setStatus('error')
      socketRef.current?.close()
    }

    const connect = () => {
      const ws = new WebSocket(serverUrl())
      socketRef.current = ws
      let entered = false

      ws.onopen = () => {
        retry = 0
        // 처음 입장하는 것이 아니거나 이미 자리가 있으면 토큰으로 돌아온다
        const session = sessionRef.current
        if (session) {
          ws.send(JSON.stringify({ t: 'rejoin', code: session.code, token: session.token } satisfies ClientMsg))
        } else if (init.kind === 'create') {
          ws.send(JSON.stringify({ t: 'create', name: init.name } satisfies ClientMsg))
        } else if (init.kind === 'join') {
          ws.send(JSON.stringify({ t: 'join', code: init.code, name: init.name } satisfies ClientMsg))
        }
      }

      ws.onmessage = (event) => {
        let msg: ServerMsg
        try {
          msg = JSON.parse(String(event.data)) as ServerMsg
        } catch {
          return
        }
        switch (msg.t) {
          case 'joined':
            sessionRef.current = { code: msg.code, token: msg.token, playerId: msg.playerId }
            saveSession(sessionRef.current)
            setReconnecting(false)
            break
          case 'lobby':
            entered = true
            setLobby(msg)
            setStatus('lobby')
            setReconnecting(false)
            break
          case 'state':
            entered = true
            setState(msg)
            setStatus('playing')
            setReconnecting(false)
            break
          case 'error':
            if (entered) {
              // 방 안에서의 거절(방장이 아님 등)은 잠깐 알리고 계속한다
              setNotice(msg.message)
            } else {
              // 입장 자체가 안 된 경우(방이 사라짐·가득 참·이름 중복)는 더 시도해도 소용없다
              fail(msg.message)
            }
            break
        }
      }

      ws.onclose = () => {
        if (stoppedRef.current) return
        // 뜻하지 않게 끊겼다: 같은 자리로 다시 붙는다
        setReconnecting(true)
        if (!sessionRef.current) {
          fail('서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.')
          return
        }
        const wait = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)]
        retry += 1
        timer = setTimeout(connect, wait)
      }
    }

    // StrictMode가 효과를 두 번 돌려도 방이 두 번 만들어지지 않게, 곧바로 연결하지 않고 한 틱 늦춘다.
    const first = setTimeout(connect, 0)

    return () => {
      stoppedRef.current = true
      clearTimeout(first)
      clearTimeout(timer)
      socketRef.current?.close()
      socketRef.current = null
    }
    // init은 한 번만 쓴다 (컴포넌트를 새로 만들어야 다른 방에 들어간다)
  }, [])

  // 방 안에서 받은 거절 메시지는 잠깐만 보여 준다
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  const start = useCallback(() => send({ t: 'start' }), [send])

  const leave = useCallback(() => {
    send({ t: 'leave' })
    stoppedRef.current = true
    saveSession(null)
    socketRef.current?.close()
  }, [send])

  // 아래 두 함수는 모양이 바뀌면 서술 연출의 효과가 다시 돌기 때문에 항상 같은 것을 돌려준다
  const sendAction = useCallback((action: ClientAction) => send({ t: 'action', action }), [send])
  const setReading = useCallback((reading: boolean) => send({ t: 'reading', reading }), [send])
  const force = useCallback(() => send({ t: 'force' }), [send])

  const client = useMemo<GameClient | null>(() => {
    if (!state) return null
    return {
      view: state.view,
      send: sendAction,
      reading: state.reading,
      setReading,
      online: state.online,
      roomCode: state.code,
      isHost: state.hostId === state.view.me.id,
      reconnecting,
      force,
    }
  }, [state, sendAction, setReading, force, reconnecting])

  return { status, error, notice, lobby, client, start, leave }
}
