import { useState } from 'react'
import { MAX_PLAYERS, type ServerMsg } from '../../net/protocol.ts'
import { ARCHETYPES, STAT_LABEL } from '../../scenario/stats.ts'
import { LobbyMap } from './LobbyMap.tsx'

type LobbyMsg = Extract<ServerMsg, { t: 'lobby' }>

const archetypeName = (id: string): string => ARCHETYPES.find((a) => a.id === id)?.name ?? id

/** 대기실: 방 코드를 알려 주고, 방장이 대상을 고르고, 각자 입사 배경을 고르고, 방장이 시작한다 */
export function Lobby({
  lobby,
  notice,
  onStart,
  onLeave,
  onMode,
  onArchetype,
}: {
  lobby: LobbyMsg
  notice: string | null
  onStart: () => void
  onLeave: () => void
  onMode: (mode: string) => void
  onArchetype: (archetype: string) => void
}) {
  const isHost = lobby.you === lobby.hostId
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const online = lobby.members.filter((m) => m.online)
  const me = lobby.members.find((m) => m.id === lobby.you)
  // 목록에 없는 대상이 서버에 남아 있어도 화면은 첫 대상을 기준으로 안내한다
  const mode = lobby.modes.find((m) => m.id === lobby.mode) ?? lobby.modes[0]

  // 보이는 자리 수: 고른 대상의 정원 (방 전체 한도 안에서)
  const capacity = Math.min(MAX_PLAYERS, mode.party.max)
  const tooFew = online.length < mode.party.min
  const tooMany = online.length > mode.party.max
  const blocked = tooFew
    ? `「${mode.name}」은(는) ${mode.party.min}명 이상이 함께해야 한다 (지금 ${online.length}명)`
    : tooMany
      ? `「${mode.name}」은(는) 최대 ${mode.party.max}명까지 (지금 ${online.length}명)`
      : null

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
    <div className="mx-auto max-w-xl px-6 py-10">
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

      {/* 대상 고르기: 지도의 점을 눌러 소개를 보고, 방장이 정한다 */}
      <section className="mt-6">
        <h2 className="mb-2 text-xs text-ash">조사할 곳 {isHost ? '(방장이 정한다)' : '(방장이 정했다)'}</h2>
        <LobbyMap
          modes={lobby.modes}
          selected={lobby.mode}
          canSelect={isHost}
          online={online.length}
          onSelect={onMode}
        />
      </section>

      {/* 입사 배경 고르기: 시나리오 모드에서 각자 */}
      {me && (
        <section className="mt-6">
          <h2 className="text-xs text-ash">내 입사 배경 (시작 스텟이 정해진다)</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {ARCHETYPES.map((a) => {
              const on = me.archetype === a.id
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onArchetype(a.id)}
                    className={`h-full w-full rounded border px-3 py-2.5 text-left transition ${
                      on ? 'border-glow/70 bg-glow/10' : 'border-edge bg-panel/50 hover:border-fog/50'
                    }`}
                  >
                    <span className="block text-sm">{a.name}</span>
                    <span className="mt-0.5 block text-xs text-ash">
                      {(['body', 'insight', 'luck'] as const).map((k) => `${STAT_LABEL[k]} ${a.stats[k]}`).join(' · ')}
                    </span>
                    <span className="mt-1 block font-serif-kr text-xs leading-5 text-fog">{a.summary}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <ul className={`mt-6 grid gap-2 ${capacity > 4 ? 'sm:grid-cols-2' : ''}`}>
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
              {archetypeName(m.archetype)}
              {m.id === lobby.hostId ? ' · 방장' : m.online ? '' : ' · 연결 끊김'}
            </span>
          </li>
        ))}
        {Array.from({ length: Math.max(0, capacity - lobby.members.length) }, (_, i) => (
          <li key={`empty-${i}`} className="rounded border border-dashed border-edge/60 px-4 py-2.5 text-sm text-ash/60">
            빈 자리
          </li>
        ))}
      </ul>

      {notice && <p className="mt-4 rounded border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">{notice}</p>}

      <div className="mt-6 space-y-3">
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={online.length === 0 || !!blocked}
              className="w-full rounded border border-glow/50 bg-glow/10 px-4 py-3 text-glow hover:bg-glow/20 disabled:opacity-50"
            >
              조사를 시작한다 ({online.length}명)
            </button>
            {blocked && <p className="text-center text-xs text-amber">{blocked}</p>}
          </>
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
