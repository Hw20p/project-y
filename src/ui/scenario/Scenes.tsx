// 시나리오 장면 화면: 이야기 · 추리(투표) · 조합(분할) · 개인 행동. 본문이 한 글자씩 흐른 뒤 선택지가 나타난다.
import { useEffect } from 'react'
import type { ScenarioClient } from '../client.ts'
import { playSfx } from '../fx.tsx'
import { useMemo } from 'react'
import { Appear, Beats, beatSteps, splitBeats, useAdvanceKey, useSequence, useSteps } from '../Narration.tsx'
import { needMoreChoiceIds, type SceneChoiceView, type ScenarioView } from '../../scenario/view.ts'
import { Changes, Continue, NewFacts, SkipHint } from './parts.tsx'

type Send = ScenarioClient['send']

const KIND_LABEL = {
  story: '',
  vote: '추리 · 다 같이 하나를 고른다',
  split: '조합 · 각자 다른 행동을 고르고, 모두의 조합이 결과를 정한다',
  personal: '개인 행동 · 모두 고르면 각자 고른 것이 자기에게 적용된다',
} as const

/** 지난 선택의 여파(`later`와 진입 효과)를 장면 위에 보인다 */
function Aftermath({ view }: { view: ScenarioView }) {
  const shown = view.aftermath
  if (shown.length === 0) return null
  return (
    <div className="mb-4 rounded border border-edge/70 bg-panel/40 px-3 py-2">
      <p className="text-[11px] tracking-widest text-ash">지난 선택의 여파</p>
      <Changes changes={shown} view={view} />
      <NewFacts changes={shown} view={view} />
    </div>
  )
}

function Header({ view }: { view: ScenarioView }) {
  const scene = view.scene!
  return (
    <>
      {KIND_LABEL[scene.kind] && (
        <p className={`text-xs tracking-widest ${scene.kind === 'personal' ? 'text-glow' : 'text-ash'}`}>{KIND_LABEL[scene.kind]}</p>
      )}
      {scene.title && <h2 className="mt-1 font-serif-kr text-xl font-bold">{scene.title}</h2>}
    </>
  )
}

/** 숫자 키로 선택지를 고른다 (잠긴 것·정원이 찬 것은 건너뛰지 않고 번호 그대로 두되 눌러도 무시된다) */
function useDigitKeys(enabled: boolean, choices: SceneChoiceView[], pick: (id: string) => void) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
      if (!/^[1-9]$/.test(e.key)) return
      const c = choices[Number(e.key) - 1]
      if (c && !c.locked) pick(c.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}

// ───────────────────────── 이야기 ─────────────────────────

export function StoryScene({ view, send }: { view: ScenarioView; send: Send }) {
  const scene = view.scene!
  const beats = useMemo(() => splitBeats(scene.text), [scene.text])
  const { steps, at } = useSteps(beatSteps(beats), [scene.text])
  const seq = useSequence(steps)
  useAdvanceKey(seq, () => send({ type: 'ready' }))

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Aftermath view={view} />
      <Header view={view} />
      <Beats beats={beats} at={at} seq={seq} />
      {seq.done ? <Continue view={view} onClick={() => send({ type: 'ready' })} /> : <SkipHint />}
    </section>
  )
}

// ───────────────────────── 추리(투표) · 조합(분할) ─────────────────────────

export function ChoiceScene({ view, send, reading }: { view: ScenarioView; send: Send; reading: string[] }) {
  void reading
  const scene = view.scene!
  const isVote = scene.kind === 'vote'
  const multi = view.players.length > 1
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? id

  const beats = useMemo(() => splitBeats(scene.text), [scene.text])
  const { steps, at } = useSteps(beatSteps(beats, [['choices', 0, 0]]), [scene.text])
  const seq = useSequence(steps)
  const ready = seq.i >= at.choices
  const blocked = view.me.panic && isVote // 정신을 잃은 사람은 투표할 수 없다

  const choose = (id: string) => {
    if (!ready || blocked) return
    const c = scene.choices.find((x) => x.id === id)
    if (!c || c.locked || (c.full && scene.myChoiceId !== id)) return
    playSfx(scene.myChoiceId === id ? 'cancel' : 'select')
    if (scene.myChoiceId === id) return send({ type: 'cancel' }) // 고른 것을 다시 누르면 취소
    send(isVote ? { type: 'vote', choiceId: id } : { type: 'pick', actionId: id })
  }

  useDigitKeys(ready && !blocked, scene.choices, choose)
  useAdvanceKey(seq)

  const top = Math.max(0, ...scene.choices.map((c) => c.pickerIds.length))
  const leaders = top > 0 ? scene.choices.filter((c) => c.pickerIds.length === top) : []
  const actedCount = view.players.filter((p) => p.acted).length
  const needMore = needMoreChoiceIds(scene)

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Aftermath view={view} />
      <Header view={view} />
      <Beats beats={beats} at={at} seq={seq} />

      {blocked && (
        <p className="mt-4 rounded border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">
          정신을 잃어 이번에는 고를 수 없다. 다른 사람들이 정한다.
        </p>
      )}

      <Appear step={at.choices} seq={seq}>
        <ul className="mt-5 space-y-2.5">
          {scene.choices.map((c, i) => {
            const mine = scene.myChoiceId === c.id
            const leading = isVote && multi && leaders.length === 1 && leaders[0].id === c.id
            const disabled = !!c.locked || blocked || (c.full && !mine)
            return (
              <li key={c.id} className="rise" style={{ animationDelay: `${i * 80}ms` }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => choose(c.id)}
                  className={`min-h-12 w-full rounded border px-3.5 py-3 text-left transition sm:px-4 ${
                    mine
                      ? 'border-glow/70 bg-glow/10'
                      : c.locked
                        ? 'border-edge/60 bg-transparent'
                        : leading
                          ? 'border-amber/40 bg-panel'
                          : 'border-edge bg-panel/60 hover:border-fog/50 hover:bg-panel'
                  } disabled:cursor-default ${c.locked ? 'opacity-60' : disabled ? 'opacity-50' : ''}`}
                >
                  <span className="flex gap-3">
                    <span className={`mt-0.5 text-sm ${mine ? 'text-glow' : 'text-ash'}`}>{i + 1}</span>
                    <span className="flex-1">
                      <span className="font-serif-kr">{c.text}</span>
                      {c.locked && <span className="mt-1 block text-xs text-ash">🔒 {c.locked}</span>}
                      {!c.locked && c.full && !mine && <span className="mt-1 block text-xs text-ash">정원이 찼다</span>}
                      {c.min !== undefined && (
                        <span className={`mt-1 block text-xs ${needMore.includes(c.id) ? 'text-amber' : 'text-ash'}`}>
                          {c.min}명이 함께해야 한다 ({c.pickerIds.length}/{c.min})
                        </span>
                      )}
                      {c.pickerIds.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {c.pickerIds.map((id) => (
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

        <p className="mt-4 text-xs text-ash">
          {needMore.length > 0 && (
            <span className="mr-2 text-amber">
              함께할 사람이 더 필요한 행동이 있다 — 의논해서 사람을 모으거나 다른 행동으로 바꿔야 진행된다 (방장은 강제로 진행할 수 있다).
            </span>
          )}
          {needMore.length === 0 &&
            multi &&
            (scene.myChoiceId
              ? `다른 사람을 기다리는 중 (${actedCount}/${view.players.length}) · 다른 선택지를 누르면 바꾸고, 같은 것을 다시 누르면 취소된다`
              : `${actedCount}/${view.players.length}명이 골랐다`)}
          {!scene.myChoiceId && <span className="kbd-hint"> · 숫자 키로도 고를 수 있다</span>}
        </p>
      </Appear>
    </section>
  )
}

// ───────────────────────── 개인 행동 ─────────────────────────

/** 내가 혼자 진행 중인 개인 단계 */
function SoloPanel({ view, send }: { view: ScenarioView; send: Send }) {
  const solo = view.scene!.solo!
  const beats = useMemo(() => splitBeats(solo.text), [solo.text])
  const { steps, at } = useSteps(beatSteps(beats, [['choices', 0, 0]]), [solo.text])
  const seq = useSequence(steps)
  const ready = seq.i >= at.choices
  const none = solo.choices.length === 0

  const pick = (id: string) => {
    if (!ready) return
    const c = solo.choices.find((x) => x.id === id)
    if (!c || c.locked) return
    playSfx('select')
    send({ type: 'solo', choiceId: id })
  }
  useDigitKeys(ready && !none, solo.choices, pick)
  useAdvanceKey(seq, none ? () => send({ type: 'ready' }) : undefined)

  // 지금 단계의 글은 마지막 줄이라서, 그 앞까지가 지금까지 혼자 겪은 일이다
  const before = solo.lines.slice(0, -1)

  return (
    <div className="mt-5 rounded border border-glow/30 bg-glow/5 p-4" onClick={() => !seq.done && seq.skip()}>
      <p className="text-xs tracking-widest text-glow">혼자 · 나만 본다</p>
      {before.length > 0 && (
        <div className="mt-2 space-y-1.5 font-serif-kr text-sm leading-7 text-ash">
          {before.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      {solo.aftermath.length > 0 && (
        <div className="mt-2">
          <Changes changes={solo.aftermath} view={view} />
          <NewFacts changes={solo.aftermath} view={view} />
        </div>
      )}
      <Beats beats={beats} at={at} seq={seq} />

      <Appear step={at.choices} seq={seq}>
        {none ? (
          <button
            type="button"
            onClick={() => send({ type: 'ready' })}
            className="mt-4 rounded border border-glow/50 bg-glow/10 px-5 py-2.5 text-sm text-glow hover:bg-glow/20"
          >
            계속 <span className="kbd-hint ml-1 text-xs text-ash">Enter</span>
          </button>
        ) : (
          <ul className="mt-4 space-y-2">
            {solo.choices.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={!!c.locked}
                  onClick={() => pick(c.id)}
                  className={`min-h-12 w-full rounded border px-3.5 py-3 text-left transition ${
                    c.locked ? 'border-edge/60 opacity-60' : 'border-edge bg-panel/60 hover:border-fog/50 hover:bg-panel'
                  } disabled:cursor-default`}
                >
                  <span className="flex gap-3">
                    <span className="mt-0.5 text-sm text-ash">{i + 1}</span>
                    <span className="flex-1 font-serif-kr">
                      {c.text}
                      {c.locked && <span className="mt-1 block font-sans text-xs text-ash">🔒 {c.locked}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Appear>
    </div>
  )
}

export function PersonalScene({ view, send, reading }: { view: ScenarioView; send: Send; reading: string[] }) {
  void reading
  const scene = view.scene!
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? id
  const picked = scene.myChoiceId
  const pickedOption = scene.choices.find((c) => c.id === picked)
  // 모두가 골라서 적용된 뒤에는 더 바꿀 수 없다 (혼자 진행하는 단계가 있거나, 내 행동이 끝났다)
  const applied = !!scene.solo || scene.mineDone

  const beats = useMemo(() => splitBeats(scene.text), [scene.text])
  const { steps, at } = useSteps(beatSteps(beats, [['choices', 0, 0]]), [scene.text])
  const seq = useSequence(steps)
  const ready = seq.i >= at.choices

  const pick = (id: string) => {
    if (!ready || applied) return
    const c = scene.choices.find((x) => x.id === id)
    if (!c || c.locked) return
    playSfx(picked === id ? 'cancel' : 'select')
    if (picked === id) return send({ type: 'cancel' }) // 고른 것을 다시 누르면 취소
    send({ type: 'pick', actionId: id })
  }
  useDigitKeys(ready && !applied, scene.choices, pick)
  useAdvanceKey(seq)

  const waiting = view.players.filter((p) => p.progress !== 'done').length

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Aftermath view={view} />
      <Header view={view} />
      <Beats beats={beats} at={at} seq={seq} />

      <Appear step={at.choices} seq={seq}>
        {!applied && (
          <p className="mt-4 text-xs text-ash">
            모두가 고를 때까지 바꾸거나 취소할 수 있다 (다른 선택지를 누르면 바뀌고, 같은 것을 다시 누르면 취소된다). 결과는 모두가 고른 뒤에 나에게만 보이고, 누가 무엇을 골랐는지는 모두에게 보인다.
          </p>
        )}
        <ul className="mt-3 space-y-2.5">
          {scene.choices.map((c, i) => {
            const mine = picked === c.id
            const disabled = !!c.locked || applied
            return (
              <li key={c.id} className="rise" style={{ animationDelay: `${i * 80}ms` }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(c.id)}
                  className={`min-h-12 w-full rounded border px-3.5 py-3 text-left transition sm:px-4 ${
                    mine
                      ? 'border-glow/70 bg-glow/10'
                      : c.locked
                        ? 'border-edge/60'
                        : 'border-edge bg-panel/60 hover:border-fog/50 hover:bg-panel'
                  } disabled:cursor-default ${c.locked ? 'opacity-60' : applied && !mine ? 'opacity-55' : ''}`}
                >
                  <span className="flex gap-3">
                    <span className={`mt-0.5 text-sm ${mine ? 'text-glow' : 'text-ash'}`}>{i + 1}</span>
                    <span className="flex-1">
                      <span className="font-serif-kr">{c.text}</span>
                      {c.locked && <span className="mt-1 block text-xs text-ash">🔒 {c.locked}</span>}
                      {c.hints && c.hints.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {c.hints.map((h) => (
                            <span key={h} className="rounded border border-gain/40 bg-gain/10 px-1.5 py-0.5 text-[11px] text-gain">
                              {h}
                            </span>
                          ))}
                        </span>
                      )}
                      {c.pickerIds.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {c.pickerIds.map((id) => (
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
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {picked && !applied && (
          <div className="mt-5 rounded border border-edge bg-panel/40 p-4">
            <p className="text-xs tracking-widest text-ash">다른 사람이 고르기를 기다리는 중</p>
            <p className="mt-2 text-xs text-ash">
              {view.players.filter((p) => p.progress !== 'choosing').length}/{view.players.length}명이 골랐다 · 결과는 모두가 고른 뒤에 나온다
            </p>
          </div>
        )}

        {picked && scene.solo && <SoloPanel key={scene.solo.text} view={view} send={send} />}

        {applied && !scene.solo && (
          <div className="mt-5 rounded border border-edge bg-panel/40 p-4">
            <p className="text-xs tracking-widest text-ash">{pickedOption ? '내 행동이 끝났다' : ''}</p>
            {scene.myLines.length > 0 && (
              <div className="mt-2 space-y-1.5 font-serif-kr text-sm leading-7 text-fog">
                {scene.myLines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-ash">
              {waiting > 0 ? `다른 사람이 끝나기를 기다리는 중 (${view.players.length - waiting}/${view.players.length})` : ''}
            </p>
          </div>
        )}
      </Appear>
    </section>
  )
}
