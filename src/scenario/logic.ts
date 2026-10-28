// 조건·글·길·효과를 평가한다. 난수를 쓰지 않는다.
import type { Change, RunPlayer, RunState, ScenarioGame } from './state.ts'
import { clampStat, isPanicked } from './stats.ts'
import type { Cond, Effect, Route, Target, Text, Who } from './types.ts'

/** 조건과 글을 평가할 때 필요한 맥락 */
export interface EvalCtx {
  run: RunState
  /** `by: 'actor'`가 가리키는 사람 (비공개 발견에서 그 행동을 고른 사람) */
  actor?: string
  /** `by: 'me'`가 가리키는 사람 (이 글을 읽는 사람) */
  viewer?: string
  /** 분할 장면의 행동 조합 (플레이어 id → 행동 id). `picked` 조건이 본다. */
  picks?: Record<string, string>
}

function whose(ctx: EvalCtx, who: Who): RunPlayer[] {
  if (who === 'any') return ctx.run.players
  const id = who === 'actor' ? ctx.actor : ctx.viewer
  const p = ctx.run.players.find((x) => x.id === id)
  return p ? [p] : []
}

export function evalCond(cond: Cond, ctx: EvalCtx): boolean {
  if ('flag' in cond) return ctx.run.flags.includes(cond.flag)
  if ('item' in cond) return whose(ctx, cond.by ?? 'any').some((p) => p.items.includes(cond.item))
  if ('knows' in cond) return whose(ctx, cond.by ?? 'any').some((p) => p.facts.includes(cond.knows))
  if ('hurt' in cond) {
    if (cond.hurt === 'all') return ctx.run.players.length > 0 && ctx.run.players.every((p) => p.hurt)
    return whose(ctx, cond.hurt).some((p) => p.hurt)
  }
  if ('stat' in cond) {
    return whose(ctx, cond.by ?? 'any').some((p) => {
      const v = p.stats[cond.stat]
      return (cond.min === undefined || v >= cond.min) && (cond.max === undefined || v <= cond.max)
    })
  }
  if ('panic' in cond) {
    if (cond.panic === 'all') return ctx.run.players.length > 0 && ctx.run.players.every(isPanicked)
    return whose(ctx, cond.panic).some(isPanicked)
  }
  if ('time' in cond) {
    const t = ctx.run.time
    return (cond.time.min === undefined || t >= cond.time.min) && (cond.time.max === undefined || t <= cond.time.max)
  }
  if ('party' in cond) {
    const n = ctx.run.players.length
    return (cond.party.min === undefined || n >= cond.party.min) && (cond.party.max === undefined || n <= cond.party.max)
  }
  if ('var' in cond) return ctx.run.vars[cond.var] === cond.is
  if ('picked' in cond) {
    const n = Object.values(ctx.picks ?? {}).filter((a) => a === cond.picked).length
    const min = cond.count?.min ?? 1
    return n >= min && (cond.count?.max === undefined || n <= cond.count.max)
  }
  if ('did' in cond) {
    const who = ctx.actor ?? ctx.viewer
    return !!who && ctx.run.lastSplit?.[who] === cond.did
  }
  if ('not' in cond) return !evalCond(cond.not, ctx)
  if ('all' in cond) return cond.all.every((c) => evalCond(c, ctx))
  return cond.any.some((c) => evalCond(c, ctx))
}

/** `{이름}`을 이번 판의 무작위 값으로, `{players}`를 인원수로 바꾼다. 모르는 이름은 그대로 둔다. */
export function interpolate(text: string, vars: RunState['vars'], players = 0): string {
  return text.replace(/\{([^{}\s]+)\}/g, (whole, name: string) =>
    name === 'players' ? String(players) : name in vars ? String(vars[name]) : whole,
  )
}

export function evalText(text: Text, ctx: EvalCtx): string {
  const parts = typeof text === 'string' ? [text] : text.filter((b) => !b.when || evalCond(b.when, ctx)).map((b) => b.text)
  return interpolate(parts.join(' '), ctx.run.vars, ctx.run.players.length)
}

/** 길을 따라 다음 장면 id를 정한다. 맞는 것이 없으면 null (검증기가 그런 시나리오를 막는다). */
export function evalRoute(route: Route, ctx: EvalCtx): string | null {
  if (typeof route === 'string') return route
  for (const r of route) {
    if (!r.when || evalCond(r.when, ctx)) return r.to
  }
  return null
}

// ───────────────────────── 효과 ─────────────────────────

interface EffectCtx {
  /** `actor` 대상이 가리키는 사람 */
  actor?: string
  /** `{ picked }` 대상을 풀기 위한 행동 조합 */
  picks?: Record<string, string>
}

function targets(game: ScenarioGame, target: Target, ctx: EffectCtx): RunPlayer[] {
  const players = game.run.players
  if (target === 'all') return players
  if (target === 'actor') return players.filter((p) => p.id === ctx.actor)
  return players.filter((p) => ctx.picks?.[p.id] === target.picked)
}

/** 효과를 게임에 적용하고, 일어난 변화를 돌려준다. (`game`을 직접 바꾼다 — 호출하는 쪽이 복사본을 넘긴다.) */
export function applyEffects(game: ScenarioGame, effects: Effect[] | undefined, ctx: EffectCtx = {}): Change[] {
  const changes: Change[] = []
  const run = game.run

  for (const e of effects ?? []) {
    if ('flag' in e) {
      const has = run.flags.includes(e.flag)
      if (e.off) run.flags = run.flags.filter((f) => f !== e.flag)
      else if (!has) run.flags.push(e.flag)
    } else if ('give' in e) {
      for (const p of targets(game, e.to, ctx)) {
        if (!p.items.includes(e.give)) {
          p.items.push(e.give)
          changes.push({ kind: 'item', playerId: p.id, id: e.give, gained: true })
        }
      }
    } else if ('take' in e) {
      for (const p of targets(game, e.from, ctx)) {
        if (p.items.includes(e.take)) {
          p.items = p.items.filter((i) => i !== e.take)
          changes.push({ kind: 'item', playerId: p.id, id: e.take, gained: false })
        }
      }
    } else if ('learn' in e) {
      for (const p of targets(game, e.to, ctx)) {
        if (!p.facts.includes(e.learn)) {
          p.facts.push(e.learn)
          changes.push({ kind: 'fact', playerId: p.id, id: e.learn })
        }
      }
    } else if ('hurt' in e) {
      for (const p of targets(game, e.hurt, ctx)) {
        if (!p.hurt) {
          p.hurt = true
          changes.push({ kind: 'hurt', playerId: p.id })
        }
      }
    } else if ('heal' in e) {
      for (const p of targets(game, e.heal, ctx)) {
        if (p.hurt) {
          p.hurt = false
          changes.push({ kind: 'heal', playerId: p.id })
        }
      }
    } else if ('stat' in e) {
      for (const p of targets(game, e.to, ctx)) {
        const before = p.stats[e.stat]
        p.stats[e.stat] = clampStat(e.stat, before + e.add)
        const amount = p.stats[e.stat] - before
        if (amount !== 0) changes.push({ kind: 'stat', playerId: p.id, stat: e.stat, amount })
      }
    } else if ('time' in e) {
      run.time += e.time
      if (e.time !== 0) changes.push({ kind: 'time', amount: e.time })
    }
  }
  return changes
}
