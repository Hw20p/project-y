// 엔딩 하나에만 붙는 연출: 이야기 속 소재가 파티 카드로 넘어온다 (엔딩 노드의 `fx`). 규칙과 무관한 장식이다.
//  - phantom : 파티 카드 사이에 없던 한 명이 서서히 늘어난다. 이름이 없고, 머리글의 인원 수도 N+1로 바뀐다.
//  - tally   : 카드가 진열된 상품처럼 칸 번호를 달고, 정신력 막대가 비며 동전이 떨어지고 "정산"이 찍힌다.
// 움직임은 index.css의 `.end-*`·`.phantom-*`·`.slot-*`에 있고, 모두 `prefers-reduced-motion`에서 정지한 최종 모습이 된다.
import type { CSSProperties } from 'react'
import type { EndingFxName } from '../../scenario/fx.ts'
import { STAT_MAX } from '../../scenario/stats.ts'
import type { ScenarioView } from '../../scenario/view.ts'
import { archetypeName } from './parts.tsx'

type Player = ScenarioView['players'][number]

export function EndingParty({ fx, players }: { fx: EndingFxName; players: Player[] }) {
  return fx === 'phantom' ? <PhantomParty players={players} /> : <TallyParty players={players} />
}

function PhantomParty({ players }: { players: Player[] }) {
  return (
    <div className="mx-auto mt-8 max-w-xl">
      <p className="relative h-5 text-xs tracking-widest text-ash" aria-live="polite">
        <span className="phantom-count-old">파티 {players.length}명</span>
        <span className="phantom-count-new">파티 {players.length + 1}명</span>
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="파티원">
        {players.map((p) => (
          <li key={p.id} className="end-card">
            <p className="truncate text-sm text-bone">{p.name}</p>
            <p className="truncate text-[11px] text-ash">{archetypeName(p.archetype)}</p>
          </li>
        ))}
        {/* 아무도 이름을 기억하지 못하는 한 명 */}
        <li className="end-card end-ghost" aria-label="이름 모를 한 명">
          <p className="ghost-name text-sm">　</p>
          <p className="truncate text-[11px] text-loss/80">방금 서명했다</p>
        </li>
      </ul>
    </div>
  )
}

function TallyParty({ players }: { players: Player[] }) {
  return (
    <div className="end-party-tally mx-auto mt-8 max-w-xl">
      <p className="text-xs tracking-widest text-glow/80">정산 · 진열 목록</p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="파티원">
        {players.map((p, i) => {
          const pct = (p.stats.sanity / STAT_MAX.sanity) * 100
          return (
            <li key={p.id} className="end-card end-slot overflow-hidden pb-6" style={{ '--i': i, '--pct': `${pct}%` } as CSSProperties}>
              <p className="text-[10px] tracking-widest text-glow/60">A-{String(i + 1).padStart(2, '0')}</p>
              <p className="truncate text-sm text-bone">{p.name}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-ink">
                <div className="slot-bar" />
              </div>
              <p className="mt-1 text-[11px] text-ash">
                <span className="slot-price-old">정신력 {p.stats.sanity}</span>
                <span className="slot-price-done">정산 완료</span>
              </p>
              {[0, 1, 2].map((c) => (
                <span key={c} className="slot-coin" style={{ '--c': c } as CSSProperties} aria-hidden>
                  ◎
                </span>
              ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
