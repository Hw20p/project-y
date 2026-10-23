import { useEffect } from 'react'
import { CONFIG } from '../engine/config.ts'
import type { ClientAction, GameView, NightEntryView } from '../engine/view.ts'
import { ContinueButton } from './ContinueButton.tsx'
import { DECISION_LABEL, hintText, itemName, signed } from './format.ts'
import { Appear, Typed, useAdvanceKey, useSequence, useSteps } from './Narration.tsx'
import { ROULETTE_MS, rouletteState, useRouletteIndex } from './Roulette.ts'

/** 결과가 화면에 일으키는 충격의 종류 (화면 번쩍임·흔들림·효과음에 쓰인다) */
export type Impact = 'death' | 'fragment' | 'item' | 'good' | 'bad'

type Result = NonNullable<GameView['result']>
type Send = (a: ClientAction) => void

export function impactOf(o: { success: boolean; died: boolean; fragments: number; items: number }): Impact {
  if (o.died) return 'death'
  if (o.fragments > 0) return 'fragment'
  if (o.items > 0) return 'item'
  return o.success ? 'good' : 'bad'
}

function Chip({ tone, children }: { tone: 'gain' | 'loss' | 'glow' | 'amber'; children: React.ReactNode }) {
  const cls = {
    gain: 'border-gain/40 text-gain',
    loss: 'border-loss/40 text-loss',
    glow: 'border-glow/40 text-glow',
    amber: 'border-amber/40 text-amber',
  }[tone]
  return <span className={`pop rounded border px-2 py-0.5 text-xs ${cls}`}>{children}</span>
}

function Chips({
  threat,
  items,
  fragments,
  died,
  guarded,
}: {
  threat: number
  items: string[]
  fragments: number
  died?: string
  guarded?: string
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {threat !== 0 && <Chip tone={threat > 0 ? 'loss' : 'gain'}>위협도 {signed(threat)}</Chip>}
      {fragments > 0 && <Chip tone="amber">진실 조각 +{fragments}</Chip>}
      {items.map((id) => (
        <Chip key={id} tone="gain">
          {itemName(id)} 획득
        </Chip>
      ))}
      {died && <Chip tone="loss">{died} 쓰러짐</Chip>}
      {guarded && <Chip tone="glow">{guarded}의 방호복이 죽음을 막았다</Chip>}
    </div>
  )
}

function HintBox({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded border border-glow/30 bg-glow/5 px-3 py-2 font-serif-kr text-sm text-glow">
      ◆ 새 단서 (당신만 안다) — {text}
    </p>
  )
}

/** 칩이 나타나는 순간 한 번만 화면 효과를 낸다 */
function useImpactOnce(reached: boolean, impact: Impact | null, onImpact: (i: Impact) => void) {
  useEffect(() => {
    if (reached && impact) onImpact(impact)
    // 한 번만 쏜다: 도달 여부가 바뀔 때만 다시 평가한다.
  }, [reached])
}

export function ResultPanel({
  view,
  send,
  onImpact,
}: {
  view: GameView
  send: Send
  onImpact: (i: Impact) => void
}) {
  const result = view.result as Result
  if (result.kind === 'team') return <TeamPanel view={view} send={send} result={result} onImpact={onImpact} />
  if (result.kind === 'night') return <NightPanel view={view} send={send} result={result} onImpact={onImpact} />
  return <MonthEndPanel view={view} send={send} result={result} />
}

// ───────────────────────── 낮·결정 ─────────────────────────

function TeamPanel({
  view,
  send,
  result,
  onImpact,
}: {
  view: GameView
  send: Send
  result: Extract<Result, { kind: 'team' }>
  onImpact: (i: Impact) => void
}) {
  const name = (id?: string) => view.players.find((p) => p.id === id)?.name
  const multi = view.players.length > 1

  // 득표 집계: 최다 득표 선택지가 여럿이면 동률(무작위 추첨), 이긴 선택지에 투표한 사람이 여럿이면 실행자도 추첨
  const votersOf = (choiceId: string) =>
    Object.entries(result.votes)
      .filter(([, cid]) => cid === choiceId)
      .map(([pid]) => pid)
  const top = Math.max(0, ...result.options.map((o) => votersOf(o.id).length))
  const tiedIds = result.options.filter((o) => votersOf(o.id).length === top).map((o) => o.id)
  const winners = votersOf(result.choiceId)
  const drawChoice = multi && result.tie && tiedIds.length > 1
  const drawActor = multi && winners.length > 1

  const { steps, at } = useSteps(
    [
      ['head', 0, multi ? 600 : 700],
      ['tally', 0, multi ? 800 : 0],
      ['pick', 0, drawChoice ? ROULETTE_MS + 700 : multi ? 500 : 0],
      ['actor', 0, drawActor ? ROULETTE_MS + 600 : multi ? 600 : 0],
      ['story', result.story?.length ?? 0, 450],
      ['outcome', result.text.length, 500],
      ['chips', 0, 600],
      ['hints', 0, 300],
    ],
    [],
  )
  const seq = useSequence(steps)
  useAdvanceKey(seq, () => send({ type: 'ready' }))

  const pickState = rouletteState(seq.i, at.pick)
  const pickLit = useRouletteIndex(tiedIds.length, tiedIds.indexOf(result.choiceId), drawChoice ? pickState : 'after')
  const actorState = rouletteState(seq.i, at.actor)
  const actorLit = useRouletteIndex(winners.length, winners.indexOf(result.actorId), drawActor ? actorState : 'after')
  // 선택이 확정되어 "선택됨"을 표시할 수 있는 시점
  const choiceSettled = drawChoice ? pickState === 'after' : seq.i >= at.pick
  const actorSettled = drawActor ? actorState === 'after' : seq.i >= at.actor

  useImpactOnce(
    seq.i >= at.chips,
    impactOf({
      success: result.success,
      died: !!result.diedId,
      fragments: result.fragments,
      items: result.gainedItems.length,
    }),
    onImpact,
  )

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Appear step={at.head} seq={seq}>
        <p className="text-xs tracking-widest text-ash">
          {result.beat === 'decision'
            ? `결정 · ${result.decisionKind ? DECISION_LABEL[result.decisionKind] : ''}`
            : '결과'}
        </p>
        {!multi && <h2 className="mt-1 font-serif-kr text-lg text-fog">{result.choiceText}</h2>}
      </Appear>

      {multi && (
        <Appear step={at.tally} seq={seq} className="mt-3">
          <p className="mb-2 text-xs text-ash">
            투표 결과
            {result.tie && pickState !== 'before' && <span className="ml-2 text-amber">동률 — 무작위 추첨</span>}
          </p>
          <ul className="space-y-2">
            {result.options.map((o) => {
              const voters = votersOf(o.id)
              const chosen = o.id === result.choiceId
              const flashing = drawChoice && pickState === 'running' && tiedIds[pickLit] === o.id
              const tiedRow = drawChoice && tiedIds.includes(o.id)
              return (
                <li
                  key={o.id}
                  className={`rounded border px-3 py-2 text-sm transition ${
                    choiceSettled && chosen
                      ? 'border-gain/60 bg-gain/10'
                      : flashing
                        ? 'border-amber bg-amber/15'
                        : choiceSettled
                          ? 'border-edge opacity-45'
                          : tiedRow
                            ? 'border-amber/40'
                            : 'border-edge'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-serif-kr">{o.text}</span>
                    {choiceSettled && chosen && <span className="shrink-0 text-xs text-gain">선택됨</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-ash">{voters.length}표</span>
                    {voters.map((pid) => (
                      <span key={pid} className="rounded-full border border-edge px-2 py-0.5 text-xs text-fog">
                        {name(pid)}
                      </span>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </Appear>
      )}

      {multi && (
        <Appear step={at.actor} seq={seq} className="mt-4">
          {winners.length > 1 && (
            <p className="mb-2 text-xs text-ash">
              누가 나설지 추첨
              {actorState !== 'after' && <span className="ml-2 text-amber">…</span>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {winners.length > 1 &&
              winners.map((pid, i) => (
                <span
                  key={pid}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    actorSettled && pid === result.actorId
                      ? 'border-gain/60 bg-gain/10 text-gain'
                      : actorState === 'running' && actorLit === i
                        ? 'border-amber bg-amber/15 text-amber'
                        : actorSettled
                          ? 'border-edge text-ash opacity-50'
                          : 'border-edge text-fog'
                  }`}
                >
                  {name(pid)}
                </span>
              ))}
            {actorSettled && (
              <span className="rise text-sm text-fog">
                {winners.length > 1 ? '→ ' : ''}
                {name(result.actorId)}이(가) 나섰다.
              </span>
            )}
          </div>
        </Appear>
      )}

      {result.story && (
        <p className="mt-4 font-serif-kr leading-8 text-fog">
          <Typed text={result.story} step={at.story} seq={seq} />
        </p>
      )}

      <p
        className={`mt-3 border-l-2 pl-3 font-serif-kr leading-8 ${
          seq.i < at.outcome ? 'invisible' : result.success ? 'border-gain/60 text-bone' : 'border-loss/60 text-loss'
        }`}
      >
        <span className="mr-2 text-xs">{result.success ? '성공' : '실패'}</span>
        <Typed text={result.text} step={at.outcome} seq={seq} />
      </p>

      <Appear step={at.chips} seq={seq}>
        <Chips
          threat={result.threat}
          items={result.gainedItems}
          fragments={result.fragments}
          died={name(result.diedId)}
          guarded={name(result.protectedId)}
        />
      </Appear>
      <Appear step={at.hints} seq={seq}>
        {result.gainedHints.map((h) => (
          <HintBox key={h.id} text={h.text} />
        ))}
      </Appear>

      {seq.done ? <ContinueButton view={view} send={send} /> : <SkipHint />}
    </section>
  )
}

function SkipHint() {
  return <p className="mt-6 text-xs text-ash/70">화면을 누르면 건너뛴다</p>
}

// ───────────────────────── 밤 ─────────────────────────

function NightPanel({
  view,
  send,
  result,
  onImpact,
}: {
  view: GameView
  send: Send
  result: Extract<Result, { kind: 'night' }>
  onImpact: (i: Impact) => void
}) {
  const name = (id?: string) => view.players.find((p) => p.id === id)?.name
  const mine = result.entries.find((e): e is Extract<NightEntryView, { self: true }> => e.self)
  const others = result.entries.filter((e) => !e.self)

  const { steps, at } = useSteps(
    [
      ['head', 0, 700],
      ['outcome', mine?.text.length ?? 0, 500],
      ['chips', 0, 600],
      ['hints', 0, 500],
      ['others', 0, 300],
    ],
    [],
  )
  const seq = useSequence(steps)
  useAdvanceKey(seq, () => send({ type: 'ready' }))

  const someoneDied = !!mine?.diedId || others.some((e) => !e.self && e.diedId)
  useImpactOnce(
    seq.i >= at.chips,
    mine?.choiceId || someoneDied
      ? impactOf({
          success: !!mine?.success,
          died: someoneDied,
          fragments: mine?.fragments ?? 0,
          items: mine?.gainedItems.length ?? 0,
        })
      : null,
    onImpact,
  )

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Appear step={at.head} seq={seq}>
        <p className="text-xs tracking-widest text-glow">밤의 결과 · 본인만 볼 수 있다</p>
        {mine?.choiceText && <h2 className="mt-1 font-serif-kr text-lg text-fog">{mine.choiceText}</h2>}
      </Appear>

      {mine ? (
        <p
          className={`mt-3 border-l-2 pl-3 font-serif-kr leading-8 ${
            seq.i < at.outcome
              ? 'invisible'
              : !mine.choiceId
                ? 'border-edge text-fog'
                : mine.success
                  ? 'border-gain/60 text-bone'
                  : 'border-loss/60 text-loss'
          }`}
        >
          {mine.choiceId && <span className="mr-2 text-xs">{mine.success ? '성공' : '실패'}</span>}
          <Typed text={mine.text} step={at.outcome} seq={seq} />
        </p>
      ) : (
        <p className="mt-3 font-serif-kr text-fog">쓰러져 있어 아무것도 하지 못했다.</p>
      )}

      <Appear step={at.chips} seq={seq}>
        {mine && (
          <Chips
            threat={mine.threat}
            items={mine.gainedItems}
            fragments={mine.fragments}
            died={mine.diedId ? view.me.name : undefined}
            guarded={mine.protectedId ? view.me.name : undefined}
          />
        )}
      </Appear>
      <Appear step={at.hints} seq={seq}>
        {mine?.gainedHints.map((id) => <HintBox key={id} text={hintText(id)} />)}
      </Appear>
      <Appear step={at.others} seq={seq}>
        {others.length > 0 && (
          <ul className="mt-5 space-y-0.5 text-xs text-ash">
            {others.map((e) => (
              <li key={e.playerId}>
                {name(e.playerId)}은(는) 각자의 밤을 보냈다.
                {e.diedId && <span className="ml-1 text-loss">{name(e.diedId)}이(가) 쓰러졌다.</span>}
              </li>
            ))}
          </ul>
        )}
      </Appear>

      {seq.done ? <ContinueButton view={view} send={send} /> : <SkipHint />}
    </section>
  )
}

// ───────────────────────── 달 끝 ─────────────────────────

function MonthEndPanel({
  view,
  send,
  result,
}: {
  view: GameView
  send: Send
  result: Extract<Result, { kind: 'monthEnd' }>
}) {
  const lost = result.lostItems[view.me.id] ?? []
  const text = result.wiped
    ? `모두 쓰러졌다. 시설이 뒤처리를 하는 동안 위협도가 ${CONFIG.WIPE_THREAT} 올랐다. 다음 달이 되어서야 눈을 떴다.`
    : result.revived.length > 0
      ? '쓰러졌던 사람들이 다음 달 아침에 눈을 뜬다. 아무도 어떻게 돌아왔는지 말하지 않는다.'
      : `무사히 한 달이 지났다. 시설이 조금 안정되었다 (위협도 −${CONFIG.MONTHLY_RECOVERY}).`

  const { steps, at } = useSteps(
    [
      ['head', 0, 700],
      ['text', text.length, 500],
      ['lost', 0, 300],
    ],
    [text],
  )
  const seq = useSequence(steps)
  useAdvanceKey(seq, () => send({ type: 'ready' }))

  return (
    <section onClick={() => !seq.done && seq.skip()}>
      <Appear step={at.head} seq={seq}>
        <p className="text-xs tracking-widest text-ash">달이 끝났다</p>
        <h2 className="mt-1 font-serif-kr text-xl font-bold">{view.entity?.name} 조사 종료</h2>
      </Appear>
      <p className="mt-3 font-serif-kr leading-8 text-fog">
        <Typed text={text} step={at.text} seq={seq} />
      </p>
      <Appear step={at.lost} seq={seq}>
        {lost.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {lost.map((id) => (
              <Chip key={id} tone="loss">
                {itemName(id)} 잃음
              </Chip>
            ))}
          </div>
        )}
      </Appear>
      {seq.done ? (
        <ContinueButton view={view} send={send} label={view.ending ? '결말로' : '다음 대상으로'} />
      ) : (
        <SkipHint />
      )}
    </section>
  )
}
