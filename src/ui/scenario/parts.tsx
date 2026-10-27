// 시나리오 화면의 작은 부품들: 변화 칩, 파티 줄(스텟), 계속 버튼, 건너뛰기 안내.
import { useState } from 'react'
import type { Change } from '../../scenario/state.ts'
import { ARCHETYPES, STAT_LABEL, STAT_MAX } from '../../scenario/stats.ts'
import type { ScenarioView } from '../../scenario/view.ts'
import { playSfx } from '../fx.tsx'

export const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

/** 이번 판에서 내가 얻은 단서. 파티원이 얻은 단서는 조사 보드에서 본다. */
export const myClues = (view: ScenarioView) => view.clues.filter((c) => c.by.some((b) => b.id === view.me.id))

export const archetypeName =(id: string): string => ARCHETYPES.find((a) => a.id === id)?.name ?? id

type Tone = 'gain' | 'loss' | 'glow' | 'amber'

export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const cls = {
    gain: 'border-gain/40 text-gain',
    loss: 'border-loss/40 text-loss',
    glow: 'border-glow/40 text-glow',
    amber: 'border-amber/40 text-amber',
  }[tone]
  return <span className={`pop rounded border px-2 py-0.5 text-xs ${cls}`}>{children}</span>
}

/** 변화 하나를 칩으로. 단서(fact)는 칩이 아니라 `NewFacts`로 따로 보인다. */
export function ChangeChip({ change, view }: { change: Change; view: ScenarioView }) {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id
  switch (change.kind) {
    case 'time':
      return <Chip tone="amber">{view.light && !view.light.name ? '하루가 지났다' : '시간이 흘렀다'} ({view.clockLabel})</Chip>
    case 'stat':
      return (
        <Chip tone={change.amount > 0 ? 'gain' : 'loss'}>
          {name(change.playerId)} {STAT_LABEL[change.stat]} {signed(change.amount)}
        </Chip>
      )
    case 'item':
      return (
        <Chip tone={change.gained ? 'gain' : 'loss'}>
          {name(change.playerId)}: {view.itemNames[change.id] ?? change.id} {change.gained ? '획득' : '잃음'}
        </Chip>
      )
    case 'hurt':
      return <Chip tone="loss">{name(change.playerId)} 부상</Chip>
    case 'heal':
      return <Chip tone="glow">{name(change.playerId)} 회복</Chip>
    case 'fact':
      return null
  }
}

/** 변화 칩 줄 (단서는 뺀다) */
export function Changes({ changes, view }: { changes: Change[]; view: ScenarioView }) {
  const shown = changes.filter((c) => c.kind !== 'fact')
  if (shown.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {shown.map((c, i) => (
        <ChangeChip key={i} change={c} view={view} />
      ))}
    </div>
  )
}

/**
 * 시계 표시. 시계가 조명인 시나리오는 남은 조명을 막대로 보이고(어두워질수록 붉어지고, 거의 꺼지면 깜빡인다) 상태를 말로 적는다.
 * 조명에 이름이 있으면("오염") 줄어드는 대신 차오르는 막대가 된다. 조명이 아닌 막대(`meter`)는 이름이 붙은 푸른 막대다. 아니면 시계 이름만 보인다.
 */
export function LightMeter({ view }: { view: ScenarioView }) {
  const gauge = view.light ?? view.meter
  if (!gauge) {
    return <span className="rounded border border-amber/30 px-2 py-0.5 text-amber">{view.clockLabel}</span>
  }
  const meter = view.light ? null : view.meter
  const name = view.light?.name ?? meter?.name
  const fills = !!view.light?.name // 수치가 차오르는 막대 (남은 칸이 아니라 찬 칸을 보인다)
  const { max } = gauge
  const left = Math.max(0, max - gauge.level)
  const shown = fills ? gauge.level : left
  const low = left <= 2
  const calm = name ? { border: 'border-glow/40 text-glow', bar: 'bg-glow' } : { border: 'border-amber/30 text-amber', bar: 'bg-amber' }
  return (
    <span
      className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 ${low ? 'border-loss/40 text-loss' : calm.border}`}
      title={name ? `${name} ${shown}/${max}` : `남은 조명 ${left}/${max}`}
    >
      {name && <span className="text-[11px] opacity-80">{name}</span>}
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-3 w-1.5 rounded-sm ${i < shown ? (low ? 'bg-loss' : calm.bar) : 'bg-edge'}`} />
        ))}
      </span>
      <span className={left <= 1 ? 'fx-flicker' : ''}>{view.clockLabel}</span>
    </span>
  )
}

/** 단서를 얻은 사람들의 이름 (전원이면 "모두", 나는 "(나)"가 붙는다) */
export function clueWho(by: { id: string; name: string }[], view: ScenarioView): string {
  if (by.length > 1 && by.length === view.players.length) return '모두'
  return by.map((b) => (b.id === view.me.id ? `${b.name}(나)` : b.name)).join(', ')
}

/** 새로 알아낸 단서: 파티 누구의 것이든 얻은 사람의 이름과 함께 모두에게 보인다 (같은 단서를 여럿이 알게 되면 하나로 묶는다) */
export function NewFacts({ changes, view }: { changes: Change[]; view: ScenarioView }) {
  const found = new Map<string, string[]>()
  for (const c of changes) if (c.kind === 'fact') found.set(c.id, [...(found.get(c.id) ?? []), c.playerId])
  if (found.size === 0) return null
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? id
  return (
    <>
      {[...found].map(([id, who]) => {
        const text = view.clues.find((c) => c.id === id)?.text ?? view.notebook.find((f) => f.id === id)?.text ?? id
        const mine = who.includes(view.me.id)
        return (
          <p
            key={id}
            className={`mt-3 rounded border px-3 py-2 font-serif-kr text-sm ${
              mine ? 'border-glow/30 bg-glow/5 text-glow' : 'border-edge bg-panel/40 text-fog'
            }`}
          >
            ◆ 새 단서 — {text}
            <span className="ml-2 font-sans text-xs text-ash">{clueWho(who.map((pid) => ({ id: pid, name: nameOf(pid) })), view)}</span>
          </p>
        )
      })}
    </>
  )
}

export function SkipHint() {
  return <p className="mt-6 text-xs text-ash/70">화면을 누르면 건너뛴다</p>
}

/** 모두가 눌러야 넘어가는 "계속" 버튼. 모바일에서는 화면 아래에 붙은 막대로 뜬다. */
export function Continue({
  view,
  onClick,
  label = '계속',
}: {
  view: ScenarioView
  onClick: () => void
  label?: string
}) {
  const me = view.players.find((p) => p.id === view.me.id)!
  const readyCount = view.players.filter((p) => p.ready).length
  return (
    <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-void via-void/95 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-5 sm:static sm:mx-0 sm:bg-none sm:p-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={me.ready}
          onClick={() => {
            playSfx('ready')
            onClick()
          }}
          className="flex-1 rounded border border-glow/50 bg-glow/10 px-5 py-3 text-sm text-glow transition hover:bg-glow/20 disabled:cursor-default disabled:border-edge disabled:bg-transparent disabled:text-ash sm:flex-none sm:py-2"
        >
          {me.ready ? '다른 사람을 기다리는 중' : label}
        </button>
        {view.players.length > 1 && (
          <span className="text-xs text-ash">
            {readyCount}/{view.players.length}
          </span>
        )}
        {!me.ready && <span className="kbd-hint text-xs text-ash">Enter</span>}
      </div>
    </div>
  )
}

/** 파티 한 사람의 현재 상태 표시: 무엇을 하고 있는지 */
function partyTag(
  view: ScenarioView,
  p: ScenarioView['players'][number],
  reading: string[],
  online: Record<string, boolean>,
): { tag: string; tone: string } {
  const waitingOnChoice = view.phase === 'vote' || view.phase === 'split'
  const waitingOnReady = view.phase === 'story' || view.phase === 'result'
  if (online[p.id] === false) return { tag: '연결 끊김', tone: 'text-amber' }
  if (p.panic) return { tag: '정신을 잃음', tone: 'text-loss' }
  if (waitingOnChoice) {
    if (p.acted) return { tag: '선택함', tone: 'text-gain' }
    if (reading.includes(p.id)) return { tag: '읽는 중', tone: 'text-glow' }
    return { tag: '고민 중', tone: 'text-ash' }
  }
  if (view.phase === 'personal') {
    if (p.progress === 'done') return { tag: '끝남', tone: 'text-gain' }
    if (p.progress === 'picked') return { tag: '선택함', tone: 'text-gain' }
    if (p.progress === 'solo') return { tag: '개인 행동 중', tone: 'text-glow' }
    if (reading.includes(p.id)) return { tag: '읽는 중', tone: 'text-glow' }
    return { tag: '고르는 중', tone: 'text-ash' }
  }
  if (waitingOnReady) {
    if (p.ready) return { tag: '준비', tone: 'text-gain' }
    if (reading.includes(p.id)) return { tag: '읽는 중', tone: 'text-glow' }
    return { tag: '대기', tone: 'text-ash' }
  }
  return { tag: '', tone: 'text-ash' }
}

/** 이 인원 수 이상이면 파티 줄을 작은 카드로 줄이고 접을 수 있게 한다 */
const COMPACT_FROM = 5

/**
 * 파티 줄: 이름·입사 배경·스텟(정신력 막대 + 나머지 숫자)·상태. 모두에게 같은 정보가 보인다.
 * 4명까지는 큰 카드, 5명부터는 작은 카드(입사 배경 줄 없음)이고 접으면 한 줄짜리 알약(이름·상태 점·정신력)만 남는다.
 */
export function ScenarioParty({
  view,
  reading,
  online,
}: {
  view: ScenarioView
  reading: string[]
  online: Record<string, boolean>
}) {
  const compact = view.players.length >= COMPACT_FROM
  const [folded, setFolded] = useState(false)

  const rows = view.players.map((p) => ({ p, isMe: p.id === view.me.id, ...partyTag(view, p, reading, online) }))

  // 접힌 모습: 이름과 상태 점, 정신력 숫자만
  if (compact && folded) {
    return (
      <div className="py-3">
        <PartyFold count={rows.length} folded onToggle={() => setFolded(false)} />
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="파티원">
          {rows.map(({ p, isMe, tag, tone }) => (
            <li
              key={p.id}
              title={`${p.name} · ${tag}`}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                isMe ? 'border-glow/40 bg-glow/5' : 'border-edge bg-panel'
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${tone}`} aria-hidden />
              <span className={p.panic ? 'text-ash line-through decoration-loss/60' : 'text-bone'}>{p.name}</span>
              <span className="text-[10px] text-ash">{p.stats.sanity}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="py-3">
      {compact && <PartyFold count={rows.length} folded={false} onToggle={() => setFolded(true)} />}
      <ul className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${compact ? 'mt-2' : ''}`} aria-label="파티원">
        {rows.map(({ p, isMe, tag, tone }) => {
          const pct = (p.stats.sanity / STAT_MAX.sanity) * 100
          return (
            <li
              key={p.id}
              className={`rounded border ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'} ${isMe ? 'border-glow/40 bg-glow/5' : 'border-edge bg-panel'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-[13px] sm:text-sm ${p.panic ? 'text-ash line-through decoration-loss/60' : 'text-bone'}`}>
                  {p.name}
                  {p.hurt && <span className="ml-1 text-xs text-loss no-underline" title="부상">✚</span>}
                </span>
                <span className={`shrink-0 text-[11px] ${tone}`}>{tag}</span>
              </div>
              {!compact && <p className="truncate text-[11px] text-ash">{archetypeName(p.archetype)}</p>}
              <div className={`${compact ? 'mt-1' : 'mt-1.5'} flex items-center gap-1.5`} title="정신력">
                <span className="w-9 shrink-0 text-[10px] text-ash">정신력</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{ width: `${pct}%`, background: pct <= 30 ? '#c0524a' : '#8a93de' }}
                  />
                </div>
                <span className="w-4 text-right text-[10px] text-fog">{p.stats.sanity}</span>
              </div>
              <p className="mt-1 text-[11px] text-ash">
                체력 <span className="text-fog">{p.stats.body}</span> · 관찰 <span className="text-fog">{p.stats.insight}</span> · 행운{' '}
                <span className="text-fog">{p.stats.luck}</span>
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** 파티 줄 위의 "파티 n명 · 접기/펼치기" */
function PartyFold({ count, folded, onToggle }: { count: number; folded: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-ash">
      <span>파티 {count}명</span>
      <button type="button" onClick={onToggle} className="underline-offset-2 hover:text-fog hover:underline">
        {folded ? '펼치기' : '접기'}
      </button>
    </div>
  )
}
