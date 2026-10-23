import { useState } from 'react'
import type { ServerMsg } from '../net/protocol.ts'

type LobbyMsg = Extract<ServerMsg, { t: 'lobby' }>

/** 대기실: 방 코드를 알려 주고, 방장이 시작하기를 기다린다 */
export function Lobby({
  lobby,
  notice,
  onStart,
  onLeave,
}: {
  lobby: LobbyMsg
  notice: string | null
  onStart: () => void
  onLeave: () => void
}) {
  const isHost = lobby.you === lobby.hostId
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const online = lobby.members.filter((m) => m.online).length

  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? lobby.code : `${location.origin}${location.pathname}?room=${lobby.code}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // 클립보드를 못 쓰는 환경(HTTP 등)에서는 코드를 눈으로 읽어 전한다.
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs tracking-widest text-ash">대기실</p>
      <h1 className="mt-2 font-serif-kr text-2xl font-bold">함께할 사람을 기다리는 중</h1>

      <div className="mt-6 rounded border border-edge bg-panel p-5 text-center">
        <p className="text-xs text-ash">방 코드</p>
        <p className="mt-1 font-serif-kr text-5xl font-bold tracking-[0.3em] text-glow">{lobby.code}</p>
        <div className="mt-4 flex justify-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => copy('code')}
            className="rounded border border-edge px-3 py-1.5 text-fog hover:border-fog/50"
          >
            {copied === 'code' ? '복사됨' : '코드 복사'}
          </button>
          <button
            type="button"
            onClick={() => copy('link')}
            className="rounded border border-edge px-3 py-1.5 text-fog hover:border-fog/50"
          >
            {copied === 'link' ? '복사됨' : '초대 링크 복사'}
          </button>
        </div>
      </div>

      <ul className="mt-6 space-y-2">
        {lobby.members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded border border-edge bg-panel/60 px-4 py-2.5"
          >
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${m.online ? 'bg-gain' : 'bg-edge'}`} aria-hidden />
              <span className={m.online ? 'text-bone' : 'text-ash'}>{m.name}</span>
              {m.id === lobby.you && <span className="text-xs text-glow">나</span>}
            </span>
            <span className="text-xs text-ash">
              {m.id === lobby.hostId ? '방장' : m.online ? '' : '연결 끊김'}
            </span>
          </li>
        ))}
        {Array.from({ length: Math.max(0, 4 - lobby.members.length) }, (_, i) => (
          <li key={`empty-${i}`} className="rounded border border-dashed border-edge/60 px-4 py-2.5 text-sm text-ash/60">
            빈 자리
          </li>
        ))}
      </ul>

      {notice && <p className="mt-4 rounded border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">{notice}</p>}

      <div className="mt-6 space-y-3">
        {isHost ? (
          <button
            type="button"
            onClick={onStart}
            disabled={online === 0}
            className="w-full rounded border border-glow/50 bg-glow/10 px-4 py-3 text-glow hover:bg-glow/20 disabled:opacity-50"
          >
            조사를 시작한다 ({online}명)
          </button>
        ) : (
          <p className="rounded border border-edge px-4 py-3 text-center text-sm text-ash">
            방장이 시작하기를 기다리는 중…
          </p>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="w-full text-xs text-ash underline-offset-2 hover:text-fog hover:underline"
        >
          방 나가기
        </button>
      </div>
    </div>
  )
}
