// 시나리오 화면의 작은 부품들: 변화 칩, 파티 줄(스텟), 계속 버튼, 건너뛰기 안내.
import type { Change } from '../../scenario/state.ts'
import { ARCHETYPES, STAT_LABEL, STAT_MAX } from '../../scenario/stats.ts'
import type { ScenarioView } from '../../scenario/view.ts'

export const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

export const archetypeName = (id: string): string => ARCHETYPES.find((a) => a.id === id)?.name ?? id

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
      return <Chip tone="amber">시간이 흘렀다 ({view.clockLabel})</Chip>
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

/** 새로 알아낸 단서 (내 것만 보인다) */
export function NewFacts({ changes, view }: { changes: Change[]; view: ScenarioView }) {
  const facts = changes.flatMap((c) => (c.kind === 'fact' && c.playerId === view.me.id ? [c.id] : []))
  if (facts.length === 0) return null
  return (
    <>
      {facts.map((id) => (
        <p
          key={id}
          className="mt-3 rounded border border-glow/30 bg-glow/5 px-3 py-2 font-serif-kr text-sm text-glow"
        >
          ◆ 새 단서 (당신만 안다) — {view.notebook.find((f) => f.id === id)?.text ?? id}
        </p>
      ))}
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
          onClick={onClick}
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

/** 파티 줄: 이름·입사 배경·스텟(정신력 막대 + 나머지 숫자)·상태. 모두에게 같은 정보가 보인다. */
export function ScenarioParty({
  view,
  reading,
  online,
}: {
  view: ScenarioView
  reading: string[]
  online: Record<string, boolean>
}) {
  const waitingOnChoice = view.phase === 'vote' || view.phase === 'split'
  const waitingOnReady = view.phase === 'story' || view.phase === 'result'

  return (
    <ul className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-4" aria-label="파티원">
      {view.players.map((p) => {
        const isMe = p.id === view.me.id
        let tag = ''
        let tone = 'text-ash'
        if (online[p.id] === false) {
          tag = '연결 끊김'
          tone = 'text-amber'
        } else if (p.panic) {
          tag = '정신을 잃음'
          tone = 'text-loss'
        } else if (waitingOnChoice) {
          if (p.acted) {
            tag = '선택함'
            tone = 'text-gain'
          } else if (reading.includes(p.id)) {
            tag = '읽는 중'
            tone = 'text-glow'
          } else {
            tag = '고민 중'
          }
        } else if (view.phase === 'personal') {
          if (p.progress === 'done') {
            tag = '끝남'
            tone = 'text-gain'
          } else if (p.progress === 'solo') {
            tag = '개인 행동 중'
            tone = 'text-glow'
          } else if (reading.includes(p.id)) {
            tag = '읽는 중'
            tone = 'text-glow'
          } else {
            tag = '고르는 중'
          }
        } else if (waitingOnReady) {
          if (p.ready) {
            tag = '준비'
            tone = 'text-gain'
          } else if (reading.includes(p.id)) {
            tag = '읽는 중'
            tone = 'text-glow'
          } else {
            tag = '대기'
          }
        }
        const pct = (p.stats.sanity / STAT_MAX.sanity) * 100
        return (
          <li
            key={p.id}
            className={`rounded border px-2.5 py-2 ${isMe ? 'border-glow/40 bg-glow/5' : 'border-edge bg-panel'}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-[13px] sm:text-sm ${p.panic ? 'text-ash line-through decoration-loss/60' : 'text-bone'}`}>
                {p.name}
                {p.hurt && <span className="ml-1 text-xs text-loss no-underline" title="부상">✚</span>}
              </span>
              <span className={`shrink-0 text-[11px] ${tone}`}>{tag}</span>
            </div>
            <p className="truncate text-[11px] text-ash">{archetypeName(p.archetype)}</p>
            <div className="mt-1.5 flex items-center gap-1.5" title="정신력">
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
  )
}
