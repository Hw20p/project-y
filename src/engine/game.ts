// 상태 머신. `reduce(ctx, state, action)`은 순수 함수이고 입력 상태를 바꾸지 않는다.
// 서버는 방마다 상태를 하나 들고 들어온 행동을 이 함수에 그대로 넘기면 된다.
// 규칙에 맞지 않는 행동(순서가 아님, 이미 죽은 사람 등)은 에러 대신 같은 상태를 돌려준다(무시).
import { CONFIG, MONTH_BEATS } from './config.ts'
import { createRng, type Rng } from './rng.ts'
import type {
  Effects,
  EndingId,
  GameState,
  MonthEndResult,
  NightEntry,
  Player,
  TeamResult,
} from './state.ts'
import type {
  Beat,
  Choice,
  DecisionChoice,
  Entity,
  GameContext,
  ItemDef,
  Outcome,
} from './types.ts'

export type GameAction =
  | { type: 'ready'; playerId: string }
  | { type: 'vote'; playerId: string; choiceId: string }
  | { type: 'night'; playerId: string; choiceId: string }
  /** 기다리지 않고 지금 있는 선택만으로 진행한다 (방장·타이머용) */
  | { type: 'force' }

export interface GameOptions {
  seed: number
  players: { id: string; name: string }[]
}

// ───────────────────────── 조회 ─────────────────────────

export function findEntity(ctx: GameContext, id: string): Entity {
  const entity = ctx.entities.find((e) => e.id === id)
  if (!entity) throw new Error(`알 수 없는 대상: ${id}`)
  return entity
}

export function findItem(ctx: GameContext, id: string): ItemDef {
  const item = ctx.items.find((i) => i.id === id)
  if (!item) throw new Error(`알 수 없는 아이템: ${id}`)
  return item
}

export function currentEntity(ctx: GameContext, state: GameState): Entity | null {
  return state.month ? findEntity(ctx, state.month.entityId) : null
}

export function currentBeat(state: GameState): Beat | null {
  return state.month ? MONTH_BEATS[state.month.beatIndex] : null
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive)
}

function isUnlocked(choice: Choice, holders: Player[]): boolean {
  return !choice.requiresItem || holders.some((p) => p.items.includes(choice.requiresItem!))
}

/** 지금 낮/결정 장면의 전체 선택지 (조건을 채운 것만) */
export function voteChoices(ctx: GameContext, state: GameState): Choice[] {
  const entity = currentEntity(ctx, state)
  const beat = currentBeat(state)
  if (!entity || !state.month || !beat || beat === 'night') return []
  const holders = alivePlayers(state)
  const all: Choice[] =
    beat === 'decision' ? entity.decisions : currentDayEvent(ctx, state)!.choices
  return all.filter((c) => isUnlocked(c, holders))
}

export function currentDayEvent(ctx: GameContext, state: GameState) {
  const entity = currentEntity(ctx, state)
  if (!entity || !state.month || currentBeat(state) !== 'day') return null
  const dayIndex = MONTH_BEATS.slice(0, state.month.beatIndex).filter((b) => b === 'day').length
  const id = state.month.dayEventIds[dayIndex]
  return entity.dayEvents.find((e) => e.id === id) ?? null
}

/** 밤 장면에서 한 플레이어가 받은 선택지 */
export function nightChoicesFor(ctx: GameContext, state: GameState, playerId: string): Choice[] {
  const entity = currentEntity(ctx, state)
  const ids = state.night?.deal[playerId] ?? []
  if (!entity) return []
  return ids.map((id) => entity.night.choices.find((c) => c.id === id)!).filter(Boolean)
}

/** 보정까지 반영한 실제 성공 확률 (화면에는 보이지 않는다. 시뮬레이션·테스트용으로 공개) */
export function chanceOf(choice: Choice, holders: Player[]): number {
  let chance = choice.baseChance
  for (const boost of choice.boosts ?? []) {
    if (holders.some((p) => p.items.includes(boost.item))) chance += boost.bonus
  }
  return Math.min(CONFIG.MAX_CHANCE, Math.max(CONFIG.MIN_CHANCE, chance))
}

// ───────────────────────── 시작 ─────────────────────────

export function createGame(ctx: GameContext, options: GameOptions): GameState {
  const { players } = options
  if (players.length < CONFIG.MIN_PLAYERS || players.length > CONFIG.MAX_PLAYERS) {
    throw new Error(`플레이어는 ${CONFIG.MIN_PLAYERS}~${CONFIG.MAX_PLAYERS}명이어야 합니다.`)
  }
  const state: GameState = {
    seed: options.seed,
    rngState: options.seed >>> 0,
    phase: 'briefing',
    players: players.map((p) => ({ id: p.id, name: p.name, alive: true, items: [], hints: [] })),
    threat: CONFIG.START_THREAT,
    fragments: 0,
    monthNumber: 0,
    month: null,
    entityQueue: [],
    votes: {},
    night: null,
    ready: [],
    lastResult: null,
    ending: null,
  }
  const rng = createRng(state.rngState)
  startMonth(ctx, state, rng)
  state.rngState = rng.getState()
  return state
}

// ───────────────────────── 행동 ─────────────────────────

export function reduce(ctx: GameContext, state: GameState, action: GameAction): GameState {
  if (state.phase === 'ended') return state
  const s = structuredClone(state)
  const rng = createRng(s.rngState)
  let accepted = false

  switch (action.type) {
    case 'ready': {
      if ((s.phase !== 'briefing' && s.phase !== 'result') || !playerOf(s, action.playerId)) break
      accepted = true
      if (!s.ready.includes(action.playerId)) s.ready.push(action.playerId)
      if (s.players.every((p) => s.ready.includes(p.id))) advance(ctx, s, rng)
      break
    }
    case 'vote': {
      const player = playerOf(s, action.playerId)
      if (s.phase !== 'vote' || !player?.alive) break
      if (!voteChoices(ctx, s).some((c) => c.id === action.choiceId)) break
      accepted = true
      s.votes[action.playerId] = action.choiceId
      if (alivePlayers(s).every((p) => s.votes[p.id])) resolveVote(ctx, s, rng)
      break
    }
    case 'night': {
      const player = playerOf(s, action.playerId)
      if (s.phase !== 'night' || !player?.alive || !s.night) break
      if (!s.night.deal[action.playerId]?.includes(action.choiceId)) break
      accepted = true
      s.night.picks[action.playerId] = action.choiceId
      if (alivePlayers(s).every((p) => s.night!.picks[p.id])) resolveNight(ctx, s, rng)
      break
    }
    case 'force': {
      accepted = true
      if (s.phase === 'vote') resolveVote(ctx, s, rng)
      else if (s.phase === 'night') resolveNight(ctx, s, rng)
      else advance(ctx, s, rng)
      break
    }
  }

  if (!accepted) return state
  s.rngState = rng.getState()
  return s
}

function playerOf(s: GameState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id)
}

// ───────────────────────── 진행 ─────────────────────────

/** 대상 하나를 새로 맡는다 (한 달의 시작) */
function startMonth(ctx: GameContext, s: GameState, rng: Rng): void {
  s.monthNumber += 1
  if (s.entityQueue.length === 0) {
    const previous = s.month?.entityId
    s.entityQueue = rng.shuffle(ctx.entities.map((e) => e.id))
    // 섞은 뒤 첫 번째가 방금 만난 대상이면 같은 대상이 연달아 나오지 않게 뒤로 보낸다.
    if (previous && s.entityQueue.length > 1 && s.entityQueue[0] === previous) {
      s.entityQueue.push(s.entityQueue.shift()!)
    }
  }
  const entity = findEntity(ctx, s.entityQueue.shift()!)
  const dayBeats = MONTH_BEATS.filter((b) => b === 'day').length
  s.month = {
    entityId: entity.id,
    beatIndex: 0,
    dayEventIds: rng.shuffle(entity.dayEvents.map((e) => e.id)).slice(0, dayBeats),
    deaths: [],
  }
  s.phase = 'briefing'
  s.ready = []
  s.votes = {}
  s.night = null
}

function enterBeat(ctx: GameContext, s: GameState, rng: Rng): void {
  s.votes = {}
  s.night = null
  s.ready = []
  if (currentBeat(s) === 'night') {
    const entity = currentEntity(ctx, s)!
    const deal: Record<string, string[]> = {}
    for (const p of alivePlayers(s)) {
      const pool = entity.night.choices.filter((c) => isUnlocked(c, [p]))
      deal[p.id] = rng.shuffle(pool).slice(0, CONFIG.NIGHT_DEAL).map((c) => c.id)
    }
    s.night = { deal, picks: {} }
    s.phase = 'night'
  } else {
    s.phase = 'vote'
  }
}

/** briefing·result 단계에서 모두 준비했을 때 다음으로 넘어간다 */
function advance(ctx: GameContext, s: GameState, rng: Rng): void {
  if (s.phase === 'briefing') {
    enterBeat(ctx, s, rng)
    return
  }
  if (s.ending) {
    s.phase = 'ended'
    return
  }
  if (s.lastResult?.kind === 'monthEnd') {
    startMonth(ctx, s, rng)
    return
  }
  if (alivePlayers(s).length === 0) {
    endMonth(ctx, s, true)
    return
  }
  s.month!.beatIndex += 1
  if (s.month!.beatIndex >= MONTH_BEATS.length) {
    endMonth(ctx, s, false)
    return
  }
  enterBeat(ctx, s, rng)
}

function endMonth(ctx: GameContext, s: GameState, wiped: boolean): void {
  const survivors = alivePlayers(s)
  if (wiped) s.threat += CONFIG.WIPE_THREAT
  else s.threat = Math.max(0, s.threat - CONFIG.MONTHLY_RECOVERY)

  const held = new Set(survivors.flatMap((p) => p.items))
  const escaped = CONFIG.ESCAPE_ITEMS.every((id) => held.has(id))

  const revived: string[] = []
  const lostItems: Record<string, string[]> = {}
  for (const p of s.players) {
    if (p.alive) continue
    const lost = p.items.filter((id) => !findItem(ctx, id).keep)
    p.items = p.items.filter((id) => findItem(ctx, id).keep)
    p.alive = true
    revived.push(p.id)
    lostItems[p.id] = lost
  }

  const result: MonthEndResult = {
    kind: 'monthEnd',
    entityId: s.month!.entityId,
    wiped,
    revived,
    lostItems,
  }
  s.lastResult = result
  s.phase = 'result'
  s.ready = []

  const ending: EndingId | null =
    s.threat >= CONFIG.COLLAPSE_THREAT
      ? 'collapse'
      : escaped
        ? 'escape'
        : s.fragments >= CONFIG.TRUTH_FRAGMENTS
          ? 'truth'
          : null
  if (ending) s.ending = { id: ending, month: s.monthNumber }
}

// ───────────────────────── 판정 ─────────────────────────

/** 결과를 적용한다: 위협도·획득물·사망 */
function applyOutcome(
  ctx: GameContext,
  s: GameState,
  actor: Player,
  outcome: Outcome,
  casualty: boolean,
): Effects {
  const fx: Effects = {
    threat: outcome.threat ?? 0,
    gainedItems: [],
    gainedHints: [],
    fragments: outcome.grant?.fragments ?? 0,
  }
  s.fragments += fx.fragments
  for (const id of outcome.grant?.items ?? []) {
    if (!actor.items.includes(id)) {
      actor.items.push(id)
      fx.gainedItems.push(id)
    }
  }
  for (const id of outcome.grant?.hints ?? []) {
    if (!actor.hints.includes(id)) {
      actor.hints.push(id)
      fx.gainedHints.push(id)
    }
  }
  if (casualty) {
    const guard = actor.items.find((id) => findItem(ctx, id).protects)
    if (guard) {
      actor.items = actor.items.filter((id) => id !== guard)
      fx.protectedId = actor.id
    } else {
      actor.alive = false
      fx.diedId = actor.id
      fx.threat += CONFIG.DEATH_THREAT
      s.month!.deaths.push(actor.id)
    }
  }
  s.threat = Math.max(0, s.threat + fx.threat)
  checkCollapse(s)
  return fx
}

function checkCollapse(s: GameState): void {
  if (!s.ending && s.threat >= CONFIG.COLLAPSE_THREAT) {
    s.ending = { id: 'collapse', month: s.monthNumber }
  }
}

function resolveVote(ctx: GameContext, s: GameState, rng: Rng): void {
  const choices = voteChoices(ctx, s)
  const alive = alivePlayers(s)

  const votes: Record<string, string> = {}
  for (const p of alive) {
    const v = s.votes[p.id]
    if (v && choices.some((c) => c.id === v)) votes[p.id] = v
  }
  const voterIds = Object.keys(votes)

  let choice: Choice
  let actor: Player
  if (voterIds.length === 0) {
    choice = rng.pick(choices)
    actor = rng.pick(alive)
  } else {
    const counts = new Map<string, number>()
    for (const id of voterIds) counts.set(votes[id], (counts.get(votes[id]) ?? 0) + 1)
    const top = Math.max(...counts.values())
    const tied = choices.filter((c) => counts.get(c.id) === top)
    choice = tied.length > 1 ? rng.pick(tied) : tied[0]
    const winners = voterIds.filter((id) => votes[id] === choice.id)
    actor = playerOf(s, rng.pick(winners))!
  }

  const success = rng.next() < chanceOf(choice, alive)
  const outcome = success ? choice.success : choice.failure
  const fx = applyOutcome(ctx, s, actor, outcome, !success && !!choice.failure.casualty)

  const beat = currentBeat(s) as Exclude<Beat, 'night'>
  const result: TeamResult = {
    kind: 'team',
    beat,
    choiceId: choice.id,
    choiceText: choice.text,
    decisionKind: beat === 'decision' ? (choice as DecisionChoice).kind : undefined,
    success,
    text: outcome.text,
    story: choice.story,
    actorId: actor.id,
    votes,
    ...fx,
  }
  s.lastResult = result
  s.phase = 'result'
  s.ready = []
  s.votes = {}
}

function resolveNight(ctx: GameContext, s: GameState, rng: Rng): void {
  const night = s.night!
  const entity = currentEntity(ctx, s)!
  const entries: NightEntry[] = []

  for (const p of alivePlayers(s)) {
    const pickId = night.picks[p.id]
    const choice = pickId ? entity.night.choices.find((c) => c.id === pickId) : undefined
    if (!choice) {
      entries.push({
        playerId: p.id,
        choiceId: null,
        success: false,
        text: '아무것도 하지 않고 밤을 보냈다.',
        threat: 0,
        gainedItems: [],
        gainedHints: [],
        fragments: 0,
      })
      continue
    }
    const success = rng.next() < chanceOf(choice, [p])
    const outcome = success ? choice.success : choice.failure
    const fx = applyOutcome(ctx, s, p, outcome, !success && !!choice.failure.casualty)
    entries.push({ playerId: p.id, choiceId: choice.id, success, text: outcome.text, ...fx })
  }

  s.lastResult = { kind: 'night', entries }
  s.phase = 'result'
  s.ready = []
  s.night = null
}
