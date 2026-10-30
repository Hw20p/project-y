// 엔딩 뒤 회고: 이번 판의 요약(며칠째·풀린 의문·단서 수·놓친 곳)과 사람별 활약도. 단서의 내용은 보이지 않고 개수만 보인다.
import type { PlayerRecap } from '../../scenario/recap.ts'
import type { EndingRecap } from '../../scenario/view.ts'
import { archetypeName } from './parts.tsx'

/** 활약 기록을 짧은 칩 글로: 0인 항목은 뺀다 */
function chipsOf(p: PlayerRecap): string[] {
  const out: string[] = []
  if (p.clues > 0) out.push(`단서 ${p.clues}${p.firsts > 0 ? ` (먼저 ${p.firsts})` : ''}`)
  if (p.probes > 0) out.push(`살핀 곳 ${p.probes}`)
  if (p.items > 0) out.push(`아이템 ${p.items}`)
  if (p.sanityLost > 0) out.push(`정신력 −${p.sanityLost}`)
  if (p.hurt > 0) out.push(`부상 ${p.hurt}`)
  return out
}

export function EndingRecapPanel({ recap, meId }: { recap: EndingRecap; meId: string }) {
  const { probes } = recap
  const summary = [
    recap.days !== null ? `${recap.days}일째에 끝났다` : null,
    recap.questions ? `의문 ${recap.questions.solved}/${recap.questions.total} 풀림` : null,
    `알아낸 단서 ${recap.clues}개`,
  ].filter(Boolean)
  const top = Math.max(...recap.players.map((p) => p.share))
  return (
    <section aria-label="이번 판 회고" className="rounded border border-edge bg-panel/40 p-4">
      <h3 className="text-xs tracking-widest text-ash">이번 판 회고</h3>
      <p className="mt-2 text-sm text-fog">{summary.join(' · ')}</p>
      <p className={`mt-1 text-xs ${probes.missed > 0 ? 'text-amber' : 'text-gain'}`}>
        {probes.missed > 0
          ? `열려 있었지만 아무도 살피지 않은 곳이 ${probes.missed}곳 있다 (살핀 곳 ${probes.taken}곳)`
          : `열려 있던 곳을 모두 살폈다 (${probes.taken}곳)`}
      </p>

      <ul className="mt-3 space-y-3" aria-label="플레이어별 활약도">
        {recap.players.map((p) => {
          const chips = chipsOf(p)
          return (
            <li key={p.id}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm text-bone">
                  {p.name}
                  {p.id === meId && <span className="ml-1 text-xs text-glow">(나)</span>}
                </span>
                <span className="text-[11px] text-ash">{archetypeName(p.archetype)}</span>
                {p.title && (
                  <span className="rounded border border-amber/40 px-1.5 text-[11px] text-amber" title={p.title.desc}>
                    {p.title.name}
                  </span>
                )}
                <span className="ml-auto text-xs text-fog">활약 {Math.round(p.share * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink">
                {/* 가장 활약한 사람이 막대 전체를 채운다 (비율을 보기 쉽게) */}
                <div
                  className="h-full rounded bg-amber/70 transition-all duration-700"
                  style={{ width: `${top > 0 ? (p.share / top) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-ash">{chips.length > 0 ? chips.join(' · ') : '눈에 띄는 기록이 없다'}</p>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-5 text-ash/70">
        활약도는 직접 알아낸 단서(가장 먼저 알아내면 더)·살핀 곳·아이템과 몸으로 치른 대가를 합친 값이다. 전원에게 일어난 일은 세지 않는다.
      </p>
    </section>
  )
}
