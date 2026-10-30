// 엔딩 뒤 회고: 한 판 동안 쌓인 활약 기록(`RunState.recap`)을 사람별 요약으로 만든다. 규칙과 무관하고 난수가 없다.
// 단서의 내용은 보이지 않는다 — 개수와 활약만 알려 주어, 놓친 것이 있다는 것만 느끼게 한다.
import type { Credit, RunRecap, RunState } from './state.ts'

export const newCredit = (): Credit => ({ clues: 0, firsts: 0, items: 0, probes: 0, hurt: 0, sanityLost: 0 })

export function recapOf(run: RunState): RunRecap {
  return (run.recap ??= { credit: {}, probes: {} })
}

export function creditOf(run: RunState, playerId: string): Credit {
  const recap = recapOf(run)
  return (recap.credit[playerId] ??= newCredit())
}

/** 활약도 점수의 무게: 단서가 가장 크고, 가장 먼저 알아낸 것에 보너스가 붙는다. 대가를 치른 것도 활약으로 친다. */
const WEIGHT = { clue: 3, first: 2, probe: 1, item: 1, hurt: 2, sanity: 0.5 } as const

export const scoreOf = (c: Credit): number =>
  c.clues * WEIGHT.clue + c.firsts * WEIGHT.first + c.probes * WEIGHT.probe + c.items * WEIGHT.item + c.hurt * WEIGHT.hurt + c.sanityLost * WEIGHT.sanity

/** 칭호: 한 가지 활약에서 **혼자** 가장 앞선 사람(0보다 크고 동률이 아님)에게 붙는다. 한 사람에게는 칭호 하나. */
const TITLES: { name: string; desc: string; value: (c: Credit) => number }[] = [
  { name: '첫 발견자', desc: '파티에서 가장 먼저 알아낸 단서가 가장 많다', value: (c) => c.firsts },
  { name: '개척자', desc: '가장 많은 곳을 직접 살폈다', value: (c) => c.probes },
  { name: '방패', desc: '정신력과 몸으로 가장 큰 대가를 치렀다', value: (c) => c.sanityLost + c.hurt * 2 },
  { name: '수집가', desc: '아이템을 가장 많이 직접 얻었다', value: (c) => c.items },
]

export interface PlayerRecap extends Credit {
  id: string
  name: string
  archetype: string
  /** 활약도 점수와, 파티 전체에서 차지한 비율(0~1) */
  score: number
  share: number
  title: { name: string; desc: string } | null
}

export interface RecapView {
  /** 조사로 열려 있던 곳 중 누군가 살핀 곳과 아무도 살피지 않은 곳 */
  probes: { taken: number; missed: number }
  players: PlayerRecap[]
}

export function buildRecap(run: RunState): RecapView {
  const credits = run.players.map((p) => ({ p, c: run.recap?.credit[p.id] ?? newCredit() }))
  const total = credits.reduce((sum, { c }) => sum + scoreOf(c), 0)

  // 칭호: 위에서부터 차례로, 이미 칭호를 받은 사람은 건너뛴다. 혼자일 때는 비교할 사람이 없어 붙이지 않는다.
  const titles = new Map<string, { name: string; desc: string }>()
  if (credits.length > 1) {
    for (const t of TITLES) {
      const ranked = credits.filter(({ p }) => !titles.has(p.id)).sort((a, b) => t.value(b.c) - t.value(a.c))
      const [first, second] = ranked
      if (first && t.value(first.c) > 0 && (!second || t.value(first.c) > t.value(second.c))) titles.set(first.p.id, { name: t.name, desc: t.desc })
    }
  }

  const probes = Object.values(run.recap?.probes ?? {})
  return {
    probes: { taken: probes.filter((v) => v === 1).length, missed: probes.filter((v) => v === 0).length },
    players: credits.map(({ p, c }) => {
      const score = scoreOf(c)
      return {
        id: p.id,
        name: p.name,
        archetype: p.archetype,
        ...c,
        score,
        share: total > 0 ? score / total : 1 / credits.length,
        title: titles.get(p.id) ?? null,
      }
    }),
  }
}
