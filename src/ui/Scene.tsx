import { useEffect } from 'react'
import type { ClientAction, GameView } from '../engine/view.ts'
import { playSfx } from './fx.tsx'
import { BEAT_LABEL } from './format.ts'
import { Appear, Typed, useSequence, useSteps } from './Narration.tsx'

/** 낮·밤·결정 장면: 본문이 흐른 뒤 선택지가 나타난다. 낮·결정에서는 누가 무엇을 고르고 있는지 실시간으로 보인다. */
export function Scene({ view, send }: { view: GameView; send: (a: ClientAction) => void }) {
  const scene = view.scene!
  const isNight = scene.beat === 'night'
  const alive = view.me.alive
  const acted = scene.myChoiceId !== null
  const total = view.players.filter((p) => p.alive).length
  const actedCount = view.players.filter((p) => p.alive && p.acted).length
  const multi = view.players.length > 1
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? id

  const { steps, at } = useSteps(
    [
      ['text', scene.text.length, 250],
      ['choices', 0, 0],
    ],
    [scene.text],
  )
  const seq = useSequence(steps)
  const ready = seq.i >= at.choices

  // 지금까지의 득표 상황
  const top = Math.max(0, ...scene.choices.map((c) => c.voterIds.length))
  const leaders = top > 0 ? scene.choices.filter((c) => c.voterIds.length === top) : []

  const choose = (choiceId: string) => {
    if (!alive || !ready) return
    playSfx('vote')
    send({ type: isNight ? 'night' : 'vote', choiceId })
  }

  // 숫자 키 = 선택지, Enter/Space = 본문 건너뛰기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
      if (!seq.done && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        seq.skip()
      } else if (ready && alive && /^[1-9]$/.test(e.key)) {
        const c = scene.choices[Number(e.key) - 1]
        if (c) choose(c.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <p className={`text-xs tracking-widest ${isNight ? 'text-glow' : 'text-ash'}`}>
        {BEAT_LABEL[scene.beat]}
        {isNight && ' · 각자 따로 고른다 (결과는 본인만 안다)'}
        {!isNight && multi && ' · 다 같이 고른다 (누가 뭘 고르는지 보인다)'}
      </p>
      <h2 className="mt-1 font-serif-kr text-xl font-bold">{scene.title}</h2>
      <p className="mt-3 font-serif-kr leading-8">
        <Typed text={scene.text} step={at.text} seq={seq} />
      </p>

      {!alive && (
        <p className="mt-4 rounded border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">
          쓰러졌다. 이번 달은 지켜볼 수만 있다.
        </p>
      )}

      <Appear step={at.choices} seq={seq}>
        <ul className="mt-5 space-y-2.5">
          {scene.choices.map((c, i) => {
            const selected = scene.myChoiceId === c.id
            const leading = multi && !isNight && leaders.length === 1 && leaders[0].id === c.id
            return (
              <li key={c.id} className="rise" style={{ animationDelay: `${i * 90}ms` }}>
                <button
                  type="button"
                  disabled={!alive}
                  onClick={() => choose(c.id)}
                  className={`min-h-12 w-full rounded border px-3.5 py-3 text-left transition sm:px-4 ${
                    selected
                      ? 'border-glow/70 bg-glow/10'
                      : leading
                        ? 'border-amber/40 bg-panel'
                        : 'border-edge bg-panel/60 hover:border-fog/50 hover:bg-panel'
                  } disabled:cursor-default disabled:opacity-60 disabled:hover:border-edge`}
                >
                  <span className="flex gap-3">
                    <span className={`mt-0.5 text-sm ${selected ? 'text-glow' : 'text-ash'}`}>{i + 1}</span>
                    <span className="flex-1">
                      <span className="font-serif-kr">{c.text}</span>
                      {c.notes.map((n, j) => (
                        <span key={j} className="mt-1 block font-serif-kr text-xs leading-6 text-glow">
                          ◆ {n}
                        </span>
                      ))}
                      {c.voterIds.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {c.voterIds.map((id) => (
                            <span
                              key={id}
                              className={`pop rounded-full border px-2 py-0.5 text-xs ${
                                id === view.me.id ? 'border-glow/50 text-glow' : 'border-edge text-fog'
                              }`}
                            >
                              {nameOf(id)}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    {leading && <span className="text-xs text-amber">다수</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {alive && !isNight && multi && (
          <p className="mt-4 text-xs text-ash">
            {leaders.length > 1 && <span className="mr-2 text-amber">동률 — 이대로면 무작위로 정해진다.</span>}
            {acted
              ? `다른 사람을 기다리는 중 (${actedCount}/${total}) · 다른 선택지를 눌러 바꿀 수 있다`
              : `${actedCount}/${total}명이 골랐다`}
            {!acted && <span className="kbd-hint"> · 숫자 키로도 고를 수 있다</span>}
          </p>
        )}
        {alive && (isNight || !multi) && (
          <p className="mt-4 text-xs text-ash">
            {acted && isNight && multi ? (
              `다른 사람을 기다리는 중 (${actedCount}/${total})`
            ) : (
              <span className="kbd-hint">숫자 키로도 고를 수 있다</span>
            )}
          </p>
        )}
      </Appear>
    </section>
  )
}
