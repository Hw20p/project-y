// 자동 플레이 봇과 집계. 밸런스(위협도 증가 속도, 엔딩 도달 비율)를 확인하는 용도다.
import { alivePlayers, chanceOf, createGame, nightChoicesFor, reduce, voteChoices } from './game.ts'
import { createRng } from './rng.ts'
import type { EndingId, GameState } from './state.ts'
import type { Choice, GameContext } from './types.ts'

export type BotPolicy = 'random' | 'safe' | 'bold'

export interface SimOptions {
  games: number
  playerCount: number
  policy: BotPolicy
  seed: number
  /** 이 달수까지 가도 엔딩이 안 나오면 중단 */
  maxMonths: number
}

export interface SimSummary {
  options: SimOptions
  endings: Record<EndingId | 'timeout', number>
  avgMonths: number
  avgDeaths: number
  avgFragments: number
}

function pickChoice(policy: BotPolicy, choices: Choice[], holders: Parameters<typeof chanceOf>[1], rnd: () => number): Choice {
  if (policy === 'random') return choices[Math.floor(rnd() * choices.length)]
  const scored = choices.map((c) => ({ c, chance: chanceOf(c, holders) }))
  scored.sort((a, b) => (policy === 'safe' ? b.chance - a.chance : a.chance - b.chance))
  return scored[0].c
}

/** 한 판을 끝까지(또는 maxMonths까지) 돌린다 */
export function playOne(ctx: GameContext, seed: number, opts: SimOptions): { state: GameState; deaths: number } {
  const players = Array.from({ length: opts.playerCount }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }))
  let state = createGame(ctx, { seed, players })
  const botRng = createRng(seed ^ 0x9e3779b9)
  let deaths = 0
  let guard = 0

  while (state.phase !== 'ended' && state.monthNumber <= opts.maxMonths && guard++ < 100000) {
    const before = state
    if (state.phase === 'briefing' || state.phase === 'result') {
      for (const p of state.players) state = reduce(ctx, state, { type: 'ready', playerId: p.id })
    } else if (state.phase === 'vote') {
      const choices = voteChoices(ctx, state)
      const holders = alivePlayers(state)
      for (const p of holders) {
        const c = pickChoice(opts.policy, choices, holders, botRng.next)
        state = reduce(ctx, state, { type: 'vote', playerId: p.id, choiceId: c.id })
      }
    } else if (state.phase === 'night') {
      for (const p of alivePlayers(state)) {
        const mine = nightChoicesFor(ctx, state, p.id)
        const holder = [state.players.find((x) => x.id === p.id)!]
        const c = pickChoice(opts.policy, mine, holder, botRng.next)
        state = reduce(ctx, state, { type: 'night', playerId: p.id, choiceId: c.id })
      }
    }
    if (before.lastResult !== state.lastResult && state.lastResult) {
      const r = state.lastResult
      if (r.kind === 'team' && r.diedId) deaths++
      if (r.kind === 'night') deaths += r.entries.filter((e) => e.diedId).length
    }
    if (state === before) throw new Error(`봇이 진행하지 못함: phase=${state.phase}`)
  }
  return { state, deaths }
}

export function simulate(ctx: GameContext, opts: SimOptions): SimSummary {
  const endings: SimSummary['endings'] = { collapse: 0, truth: 0, escape: 0, timeout: 0 }
  let months = 0
  let deaths = 0
  let fragments = 0
  for (let i = 0; i < opts.games; i++) {
    const { state, deaths: d } = playOne(ctx, opts.seed + i, opts)
    endings[state.ending?.id ?? 'timeout']++
    months += state.ending?.month ?? state.monthNumber
    deaths += d
    fragments += state.fragments
  }
  return {
    options: opts,
    endings,
    avgMonths: months / opts.games,
    avgDeaths: deaths / opts.games,
    avgFragments: fragments / opts.games,
  }
}
