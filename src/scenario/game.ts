// 시나리오 모드의 상태 머신. `reduceScenario`는 순수 함수이고 입력 상태를 바꾸지 않는다.
// 판정에 난수가 없다: 같은 시드(= 같은 무작위 값)와 같은 행동이면 항상 같은 결과다.
// 규칙에 맞지 않는 행동은 에러 없이 같은 상태를 돌려준다(무시) — 서버가 그대로 받아 넘길 수 있게.
import { createRng } from './rng.ts'
import { applyEffects, evalCond, evalRoute, evalText } from './logic.ts'
import type { Change, PersonalProgress, PrivateResult, RunPlayer, ScenarioGame, ScenarioResult } from './state.ts'
import { findArchetype, isPanicked } from './stats.ts'
import type {
  Effect,
  Node,
  PersonalNode,
  PersonalOption,
  PersonalStep,
  Scenario,
  SoloChoice,
  SplitAction,
  SplitNode,
  StoryNode,
  VoteChoice,
  VoteNode,
} from './types.ts'

export type ScenarioAction =
  | { type: 'ready'; playerId: string }
  | { type: 'vote'; playerId: string; choiceId: string }
  /** 분할 장면의 행동, 또는 개인 장면에서 처음 고르는 선택지 */
  | { type: 'pick'; playerId: string; actionId: string }
  /** 개인 장면에서 이어지는 개인 단계의 선택지 */
  | { type: 'solo'; playerId: string; choiceId: string }
  /** 모두가 고르기 전에 내 선택(투표·행동·개인 선택)을 거둔다 */
  | { type: 'cancel'; playerId: string }
  /**
   * 기다리지 않고 지금 있는 것만으로 진행한다 (방장·타이머용).
   * 읽기·결과 단계에서는 그냥 다음으로 넘어가고, 개인 장면에서는 아직 안 끝난 사람의 진행을 거기서 끝낸다.
   */
  | { type: 'force' }
  /** 엔딩 뒤 새 판을 시작한다 (단서 노트와 닿은 엔딩은 남는다) */
  | { type: 'retry' }

// ───────────────────────── 조회 ─────────────────────────

export function findNode(sc: Scenario, id: string): Node {
  const node = sc.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`시나리오 ${sc.id}: 알 수 없는 장면 "${id}"`)
  return node
}

export function currentNode(sc: Scenario, g: ScenarioGame): Node {
  return findNode(sc, g.run.nodeId)
}

export function findStep(node: PersonalNode, id: string): PersonalStep {
  const step = node.steps?.find((s) => s.id === id)
  if (!step) throw new Error(`개인 장면 "${node.id}": 알 수 없는 단계 "${id}"`)
  return step
}

/** 지금 고를 수 있는 투표 선택지 (조건을 채운 것) */
export function openVoteChoices(g: ScenarioGame, node: VoteNode): VoteChoice[] {
  return node.choices.filter((c) => !c.when || evalCond(c.when, { run: g.run }))
}

/** 투표에 참여해야 하는 사람들: 정신을 잃은 사람은 고를 수 없어서 빠진다 */
export function voters(g: ScenarioGame): RunPlayer[] {
  return g.run.players.filter((p) => !isPanicked(p))
}

export type ActionState = { open: true } | { open: false; reason: string }

const PANIC_REASON = '정신을 잃어 할 수 없다'

/** 정원(`max`)과 최소 인원(`min`)을 빼고, 이 사람이 이 행동을 할 수 있는 조건인지 */
function baseActionOpen(g: ScenarioGame, action: SplitAction, p: RunPlayer): ActionState {
  if (isPanicked(p) && !action.calming) return { open: false, reason: PANIC_REASON }
  if (action.when && !evalCond(action.when, { run: g.run, actor: p.id, viewer: p.id })) {
    return { open: false, reason: action.locked ?? '' }
  }
  if (action.needsHealthy && p.hurt && !action.calming) return { open: false, reason: action.locked ?? '부상 때문에 할 수 없다' }
  return { open: true }
}

/** 정원(`max`)을 빼고, 이 사람이 이 행동을 할 수 있는 조건인지. 최소 인원(`min`)이 있으면 이 행동을 할 수 있는 사람이 그만큼은 있어야 한다. */
function actionOpenFor(g: ScenarioGame, action: SplitAction, p: RunPlayer): ActionState {
  const base = baseActionOpen(g, action, p)
  if (!base.open || action.min === undefined) return base
  const able = g.run.players.filter((q) => baseActionOpen(g, action, q).open).length
  return able >= action.min ? base : { open: false, reason: '' }
}

/** 분할 장면에서 인원이 모자란 행동들: 고른 사람이 있지만 최소 인원(`min`)에 못 미친다. 이런 행동이 있으면 장면이 진행되지 않는다. */
export function splitShort(g: ScenarioGame, node: SplitNode): SplitAction[] {
  return node.actions.filter((a) => {
    if (a.min === undefined) return false
    const n = Object.values(g.run.picks).filter((id) => id === a.id).length
    return n > 0 && n < a.min
  })
}

/** 한 사람이 이 행동을 지금 고를 수 있는지. 못 고르면 이유(잠긴 문구)를 돌려준다. */
export function actionState(g: ScenarioGame, action: SplitAction, playerId: string): ActionState {
  const player = g.run.players.find((p) => p.id === playerId)
  if (!player) return { open: false, reason: '' }
  const base = actionOpenFor(g, action, player)
  if (!base.open) return base
  if (action.max !== undefined) {
    const others = Object.entries(g.run.picks).filter(([pid, a]) => a === action.id && pid !== playerId).length
    if (others >= action.max) return { open: false, reason: '이미 다른 사람이 하고 있다' }
  }
  return { open: true }
}

/** 분할 장면에서 고를 수 있는 행동이 하나라도 있는 사람들 (정원은 따지지 않는다). 이 사람들이 다 골라야 진행한다. */
export function splitPickers(g: ScenarioGame, node: SplitNode): RunPlayer[] {
  return g.run.players.filter((p) => node.actions.some((a) => actionOpenFor(g, a, p).open))
}

function optionOpenFor(g: ScenarioGame, o: PersonalOption | SoloChoice, p: RunPlayer): ActionState {
  if (isPanicked(p) && !o.calming) return { open: false, reason: PANIC_REASON }
  if (o.when && !evalCond(o.when, { run: g.run, actor: p.id, viewer: p.id })) return { open: false, reason: o.locked ?? '' }
  return { open: true }
}

export const personalOptionState = (g: ScenarioGame, o: PersonalOption, playerId: string): ActionState => {
  const p = g.run.players.find((x) => x.id === playerId)
  return p ? optionOpenFor(g, o, p) : { open: false, reason: '' }
}

export const soloChoiceState = (g: ScenarioGame, c: SoloChoice, playerId: string): ActionState => {
  const p = g.run.players.find((x) => x.id === playerId)
  return p ? optionOpenFor(g, c, p) : { open: false, reason: '' }
}

// ───────────────────────── 시작 ─────────────────────────

export interface ScenarioOptions {
  seed: number
  /** `archetype`은 입사 배경 id (방에서 시작 전에 고른다). 없으면 신입. */
  players: { id: string; name: string; archetype?: string }[]
  /** 이번 판의 무작위 값을 시드 대신 고정한다 (전수 탐색기·시험용). 첫 판에만 적용된다. */
  vars?: Record<string, string | number>
}

export function createScenarioGame(sc: Scenario, options: ScenarioOptions): ScenarioGame {
  const roster = options.players
  if (roster.length === 0) throw new Error('플레이어가 한 명 이상이어야 합니다.')
  const g: ScenarioGame = {
    scenarioId: sc.id,
    baseSeed: options.seed >>> 0,
    runNo: 0,
    run: undefined as never, // startRun이 바로 채운다
    notebooks: Object.fromEntries(roster.map((p) => [p.id, [] as string[]])),
    endings: {},
  }
  startRun(sc, g, roster, options.vars)
  return g
}

function startRun(
  sc: Scenario,
  g: ScenarioGame,
  roster: ScenarioOptions['players'],
  fixedVars?: Record<string, string | number>,
): void {
  g.runNo += 1
  const seed = (g.baseSeed ^ Math.imul(g.runNo, 0x9e3779b1)) >>> 0
  const rng = createRng(seed)
  const vars: Record<string, string | number> = {}
  for (const v of sc.vars ?? []) vars[v.id] = rng.pick(v.pick)
  Object.assign(vars, fixedVars)
  g.run = {
    seed,
    vars,
    nodeId: sc.start,
    time: 0,
    period: 'day',
    flags: [],
    players: roster.map((p): RunPlayer => {
      const archetype = findArchetype(p.archetype)
      return { id: p.id, name: p.name, archetype: archetype.id, stats: { ...archetype.stats }, items: [], facts: [], hurt: false }
    }),
    phase: 'story',
    votes: {},
    picks: {},
    personal: {},
    pending: [],
    aftermath: [],
    ready: [],
    result: null,
    endingId: null,
    visited: [],
  }
  go(sc, g, sc.start)
}

// ───────────────────────── 행동 ─────────────────────────

export function reduceScenario(sc: Scenario, state: ScenarioGame, action: ScenarioAction): ScenarioGame {
  const g = structuredClone(state)
  const run = g.run
  const player = 'playerId' in action ? run.players.find((p) => p.id === action.playerId) : undefined

  switch (action.type) {
    case 'ready': {
      if (!player) return state
      if (run.phase === 'story' || run.phase === 'result') {
        if (!run.ready.includes(player.id)) run.ready.push(player.id)
        if (run.players.every((p) => run.ready.includes(p.id))) advance(sc, g)
        return g
      }
      if (run.phase === 'personal') {
        const node = currentNode(sc, g)
        const prog = run.personal[player.id]
        if (node.kind !== 'personal' || !prog?.step || prog.done) return state
        const step = findStep(node, prog.step)
        if (step.choices?.length) return state // 선택해야 하는 단계는 계속으로 넘어갈 수 없다
        enterStep(g, node, player, step.then)
        settlePersonal(sc, g, node)
        return g
      }
      return state
    }
    case 'vote': {
      const node = currentNode(sc, g)
      if (!player || run.phase !== 'vote' || node.kind !== 'vote' || isPanicked(player)) return state
      if (!openVoteChoices(g, node).some((c) => c.id === action.choiceId)) return state
      run.votes[player.id] = action.choiceId
      if (voters(g).every((p) => run.votes[p.id])) resolveVote(sc, g, node)
      return g
    }
    case 'pick': {
      const node = currentNode(sc, g)
      if (!player) return state
      if (run.phase === 'split' && node.kind === 'split') {
        const chosen = node.actions.find((a) => a.id === action.actionId)
        if (!chosen || !actionState(g, chosen, player.id).open) return state
        run.picks[player.id] = chosen.id
        // 인원이 모자란 행동이 남아 있으면 진행하지 않는다 (함께할 사람을 모아야 한다)
        if (splitPickers(g, node).every((p) => run.picks[p.id]) && splitShort(g, node).length === 0) resolveSplit(sc, g, node)
        return g
      }
      if (run.phase === 'personal' && node.kind === 'personal') {
        const prog = run.personal[player.id]
        const option = node.options.find((o) => o.id === action.actionId)
        if (!prog || prog.committed || prog.done || !option || !personalOptionState(g, option, player.id).open) return state
        // 모두가 고를 때까지는 고르기만 한다 (바꾸거나 취소할 수 있고, 효과도 글도 아직 없다)
        prog.pick = option.id
        run.picks[player.id] = option.id
        if (run.players.every((p) => run.personal[p.id]?.done || run.personal[p.id]?.pick)) commitPersonal(sc, g, node, true)
        return g
      }
      return state
    }
    case 'cancel': {
      const node = currentNode(sc, g)
      if (!player) return state
      if (run.phase === 'vote' && run.votes[player.id]) {
        delete run.votes[player.id]
        return g
      }
      if (run.phase === 'split' && run.picks[player.id]) {
        delete run.picks[player.id]
        return g
      }
      const prog = run.personal[player.id]
      if (run.phase === 'personal' && node.kind === 'personal' && prog && !prog.committed && !prog.done && prog.pick !== null) {
        prog.pick = null
        delete run.picks[player.id]
        return g
      }
      return state
    }
    case 'solo': {
      const node = currentNode(sc, g)
      if (!player || run.phase !== 'personal' || node.kind !== 'personal') return state
      const prog = run.personal[player.id]
      if (!prog?.step || prog.done) return state
      const step = findStep(node, prog.step)
      const choice = step.choices?.find((c) => c.id === action.choiceId)
      if (!choice || !soloChoiceState(g, choice, player.id).open) return state
      prog.changes.push(...applyEffects(g, choice.effects, { actor: player.id }))
      prog.later.push(...(choice.later ?? []))
      if (choice.result) prog.lines.push(evalText(choice.result, { run, actor: player.id, viewer: player.id }))
      enterStep(g, node, player, choice.then)
      settlePersonal(sc, g, node)
      return g
    }
    case 'force': {
      const node = currentNode(sc, g)
      if (run.phase === 'vote' && node.kind === 'vote') {
        resolveVote(sc, g, node)
        return g
      }
      if (run.phase === 'split' && node.kind === 'split') {
        resolveSplit(sc, g, node)
        return g
      }
      if (run.phase === 'personal' && node.kind === 'personal') {
        commitPersonal(sc, g, node, false) // 아직 안 적용된 선택은 지금 적용하고, 이어지는 개인 단계는 거기서 끝낸다
        for (const prog of Object.values(run.personal)) prog.done = true
        settlePersonal(sc, g, node)
        return g
      }
      if (run.phase === 'story' || run.phase === 'result') {
        advance(sc, g)
        return g
      }
      return state
    }
    case 'retry': {
      if (run.phase !== 'ended') return state
      startRun(sc, g, run.players.map((p) => ({ id: p.id, name: p.name, archetype: p.archetype })))
      return g
    }
  }
}

// ───────────────────────── 진행 ─────────────────────────

/** 마감·전원 부상·전원 정신 상실이면 가려던 곳 대신 정해진 엔딩으로 간다 */
function override(sc: Scenario, g: ScenarioGame): string | null {
  const run = g.run
  if (sc.deadline && run.time >= sc.deadline.time) return sc.deadline.node
  if (sc.onAllHurt && run.players.length > 0 && run.players.every((p) => p.hurt)) return sc.onAllHurt
  if (sc.onAllPanic && run.players.length > 0 && run.players.every(isPanicked)) return sc.onAllPanic
  return null
}

/** 장면에 들어간다 */
function go(sc: Scenario, g: ScenarioGame, target: string, depth = 0, carry: Change[] = []): void {
  let id = target
  let node = findNode(sc, id)
  if (node.kind !== 'ending') {
    const redirect = override(sc, g)
    if (redirect && redirect !== id) {
      id = redirect
      node = findNode(sc, id)
    }
  }

  const run = g.run
  run.nodeId = id
  run.visited.push(id)
  run.votes = {}
  run.picks = {}
  run.personal = {}
  run.ready = []
  run.result = null
  // 밤에서 낮으로 넘어가면 하루가 지난다: 하루씩 흐르는 시계(`clock.byDay`)는 이때 1 오른다 (오답·패스든 성공이든 똑같이)
  const period = node.period ?? run.period
  const dawn = !!sc.clock.byDay && run.period === 'night' && period === 'day'
  run.period = period
  // 지난 선택의 여파(`later`)와 이 장면의 진입 효과를 적용하고, 화면에 보일 수 있게 남긴다
  const aftermath = [...carry, ...flushPending(g), ...(dawn ? applyEffects(g, [{ time: 1 }]) : []), ...applyEffects(g, node.onEnter)]
  run.aftermath = aftermath

  if (node.kind === 'ending') {
    run.endingId = id
    run.phase = 'ended'
    g.endings[id] = (g.endings[id] ?? 0) + 1
    return
  }
  // 들어오며 받은 효과(시간·부상·정신력)가 마감이나 전원 부상을 만들었다면 곧바로 그쪽으로 간다
  if (depth < 4) {
    const again = override(sc, g)
    if (again && again !== id) {
      go(sc, g, again, depth + 1, aftermath)
      return
    }
  }
  run.phase = node.kind

  // 할 수 있는 사람이 아무도 없는 장면은 기다리지 않고 바로 처리한다 (정신을 잃은 사람만 남은 경우 등)
  if (node.kind === 'vote' && voters(g).length === 0) resolveVote(sc, g, node)
  else if (node.kind === 'split' && splitPickers(g, node).length === 0) resolveSplit(sc, g, node)
  else if (node.kind === 'personal') startPersonal(sc, g, node)
}

/** 기다리던 효과(`later`)를 지금 적용하고 일어난 변화를 돌려준다 */
function flushPending(g: ScenarioGame): Change[] {
  const changes: Change[] = []
  for (const p of g.run.pending) changes.push(...applyEffects(g, p.effects, { actor: p.actor, picks: p.picks }))
  g.run.pending = []
  return changes
}

function queue(g: ScenarioGame, effects: Effect[] | undefined, actor?: string, picks?: Record<string, string>): void {
  if (effects && effects.length > 0) g.run.pending.push({ effects, actor, picks })
}
function route(sc: Scenario, g: ScenarioGame, r: StoryNode['next'], picks?: Record<string, string>): string {
  const to = evalRoute(r, { run: g.run, picks })
  if (!to) throw new Error(`시나리오 ${sc.id}: 장면 "${g.run.nodeId}"의 길이 어느 조건에도 맞지 않는다`)
  return to
}

/** story·result 단계에서 모두 준비했을 때 */
function advance(sc: Scenario, g: ScenarioGame): void {
  const run = g.run
  if (run.phase === 'result' && run.result) {
    go(sc, g, run.result.next)
    return
  }
  const node = findNode(sc, run.nodeId)
  if (run.phase === 'story' && node.kind === 'story') go(sc, g, route(sc, g, node.next))
}

/** 글자 하나하나를 섞어 숫자 하나로 만든다 (동률 추첨의 시드에 장면 이름을 섞기 위함) */
function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * 투표를 센다. 동률이면 **무작위로 하나가 뽑힌다** — 시드와 장면에서 나오는 값이라 같은 판·같은 장면·같은 표에서는 같은 결과이고,
 * 새 판(`retry`)에서는 시드가 바뀐다. 아무도 고르지 않았는데 강제로 진행된 경우에만 첫 선택지가 된다.
 */
function resolveVote(sc: Scenario, g: ScenarioGame, node: VoteNode): void {
  const run = g.run
  const choices = openVoteChoices(g, node)
  const votes: Record<string, string> = {}
  for (const p of voters(g)) {
    const v = run.votes[p.id]
    if (v && choices.some((c) => c.id === v)) votes[p.id] = v
  }

  const counts = new Map<string, number>()
  for (const id of Object.values(votes)) counts.set(id, (counts.get(id) ?? 0) + 1)
  const top = Math.max(0, ...counts.values())
  const tied = top === 0 ? choices : choices.filter((c) => counts.get(c.id) === top)

  let chosen: VoteChoice
  let draw: ScenarioResult['draw']
  if (tied.length === 1 || top === 0) {
    chosen = tied[0]
  } else {
    // 동률: 시드로 하나를 뽑는다 (같은 장면을 다시 지나도 장면에 들어온 횟수가 달라 다른 값이 나온다)
    const rng = createRng((run.seed ^ Math.imul(run.visited.length, 0x9e3779b1) ^ hashOf(node.id)) >>> 0)
    chosen = rng.pick(tied)
    draw = { options: tied.map((c) => evalText(c.text, { run })), chosen: evalText(chosen.text, { run }) }
  }

  const changes = applyEffects(g, chosen.effects)
  queue(g, chosen.later)
  const text = chosen.result ? evalText(chosen.result, { run }) : ''
  const next = route(sc, g, chosen.next)

  // 보여 줄 것이 없으면 결과 화면 없이 바로 다음으로 간다
  if (!text && changes.length === 0 && !draw) {
    go(sc, g, next)
    return
  }
  const result: ScenarioResult = {
    kind: 'vote',
    nodeId: node.id,
    choiceText: evalText(chosen.text, { run }),
    ...(draw ? { draw } : {}),
    votes,
    options: choices.map((c) => ({ id: c.id, text: evalText(c.text, { run }) })),
    text,
    private: {},
    changes,
    next,
  }
  run.result = result
  run.phase = 'result'
  run.ready = []
  run.votes = {}
}

function resolveSplit(sc: Scenario, g: ScenarioGame, node: SplitNode): void {
  const run = g.run
  const picks = { ...run.picks }
  // 강제 진행으로 넘어온 경우: 인원이 모자란 행동을 고른 사람은 아무것도 하지 않은 것으로 친다
  for (const a of splitShort(g, node)) {
    for (const [pid, id] of Object.entries(picks)) if (id === a.id) delete picks[pid]
  }

  // 1) 비공개 발견: 조건은 모두 같은 시점의 상태로 정하고, 효과는 사람 순서대로 적용한다
  const found = run.players.map((p) => {
    const action = picks[p.id]
    const finding = node.private?.find(
      (f) => f.action === action && (!f.when || evalCond(f.when, { run, actor: p.id, viewer: p.id, picks })),
    )
    return { player: p, finding }
  })
  const privateChanges = new Map<string, ReturnType<typeof applyEffects>>()
  for (const { player, finding } of found) {
    if (finding) {
      privateChanges.set(player.id, applyEffects(g, finding.effects, { actor: player.id, picks }))
      queue(g, finding.later, player.id, picks)
    }
  }
  const privateResults: Record<string, PrivateResult> = {}
  for (const { player, finding } of found) {
    if (!finding) continue
    privateResults[player.id] = {
      text: evalText(finding.text, { run, actor: player.id, viewer: player.id, picks }),
      changes: privateChanges.get(player.id) ?? [],
    }
  }

  // 2) 조합의 결과: 비공개 발견의 효과가 반영된 상태에서 위에서부터 처음 맞는 것
  const outcome = node.outcomes.find((o) => !o.when || evalCond(o.when, { run, picks }))
  if (!outcome) throw new Error(`시나리오 ${sc.id}: 분할 장면 "${node.id}"의 결과가 어느 조합에도 맞지 않는다`)
  const changes = applyEffects(g, outcome.effects, { picks })
  queue(g, outcome.later, undefined, picks)
  const text = outcome.text ? evalText(outcome.text, { run, picks }) : ''
  const next = route(sc, g, outcome.next, picks)

  if (!text && changes.length === 0 && Object.keys(privateResults).length === 0) {
    go(sc, g, next)
    return
  }
  run.result = {
    kind: 'split',
    nodeId: node.id,
    picks,
    options: node.actions.map((a) => ({ id: a.id, text: evalText(a.text, { run }) })),
    text,
    private: privateResults,
    changes,
    next,
  }
  run.phase = 'result'
  run.ready = []
  run.picks = {}
}

// ───────────────────────── 개인 장면 ─────────────────────────

/** 개인 장면에 들어왔을 때: 모두에게 진행 칸을 만들고, 할 수 있는 것이 없는 사람은 거기서 끝낸다 */
function startPersonal(sc: Scenario, g: ScenarioGame, node: PersonalNode): void {
  const run = g.run
  for (const p of run.players) {
    const prog: PersonalProgress = { pick: null, committed: false, step: null, done: false, lines: [], changes: [], later: [], stepChanges: [] }
    run.personal[p.id] = prog
    if (!node.options.some((o) => optionOpenFor(g, o, p).open)) {
      prog.done = true
      prog.committed = true
      prog.lines.push(isPanicked(p) ? '정신을 잃어 아무것도 하지 못했다.' : '할 수 있는 일이 없었다.')
    }
  }
  settlePersonal(sc, g, node)
}

/**
 * 모두가 골랐으니 각자의 선택을 적용한다 (사람 순서대로). `enter`가 거짓이면(강제 진행) 이어지는 개인 단계에는 들어가지 않고
 * 그 사람의 행동을 거기서 끝낸다. 고르지 않은 사람은 아무것도 하지 않은 채 끝난다.
 */
function commitPersonal(sc: Scenario, g: ScenarioGame, node: PersonalNode, enter: boolean): void {
  const run = g.run
  for (const player of run.players) {
    const prog = run.personal[player.id]
    if (!prog || prog.committed || prog.done) continue
    prog.committed = true
    const option = node.options.find((o) => o.id === prog.pick)
    if (!option) {
      prog.done = true
      continue
    }
    prog.changes.push(...applyEffects(g, option.effects, { actor: player.id }))
    prog.later.push(...(option.later ?? []))
    if (option.result) prog.lines.push(evalText(option.result, { run, actor: player.id, viewer: player.id }))
    enterStep(g, node, player, enter ? option.then : undefined)
  }
  settlePersonal(sc, g, node)
}

/** 이 사람이 미뤄 둔 효과(`later`)를 다음 장면에 들어갈 때 적용되도록 넘긴다 */
function promoteLater(g: ScenarioGame, playerId: string): void {
  const prog = g.run.personal[playerId]
  if (prog && prog.later.length > 0) {
    g.run.pending.push({ effects: prog.later, actor: playerId })
    prog.later = []
  }
}

/** 한 사람이 개인 단계로 들어간다 (`stepId`가 없으면 이 사람의 개인 행동이 끝난다) */
function enterStep(g: ScenarioGame, node: PersonalNode, player: RunPlayer, stepId: string | undefined): void {
  const run = g.run
  const prog = run.personal[player.id]
  prog.stepChanges = []
  if (!stepId) {
    prog.step = null
    prog.done = true
    promoteLater(g, player.id)
    return
  }
  const step = findStep(node, stepId)
  prog.step = step.id
  // 앞에서 미뤄 둔 효과(여파)가 먼저 적용되고, 이어서 이 단계의 진입 효과가 적용된다
  const later = applyEffects(g, prog.later, { actor: player.id })
  prog.later = []
  prog.stepChanges = [...later, ...applyEffects(g, step.effects, { actor: player.id })]
  prog.changes.push(...prog.stepChanges)
  prog.lines.push(evalText(step.text, { run, actor: player.id, viewer: player.id }))
  // 고를 수 있는 선택지가 하나도 없으면(정신을 잃은 경우 등) 여기서 끝난다
  if (step.choices?.length && !step.choices.some((c) => optionOpenFor(g, c, player).open)) {
    prog.step = null
    prog.done = true
    prog.lines.push(isPanicked(player) ? '정신을 잃어 더는 움직이지 못했다.' : '더 할 수 있는 일이 없었다.')
    promoteLater(g, player.id)
  }
}

/** 모두 끝났으면 결과로 넘어간다 */
function settlePersonal(sc: Scenario, g: ScenarioGame, node: PersonalNode): void {
  const run = g.run

  // 진행 중에 정신을 잃어(다른 사람의 효과로) 더는 고를 수 있는 것이 없어진 사람은 거기서 끝낸다 — 안 그러면 모두가 기다리게 된다
  for (const p of run.players) {
    const prog = run.personal[p.id]
    if (!prog || prog.done) continue
    const step = prog.step ? findStep(node, prog.step) : null
    const stuck = step
      ? !!step.choices?.length && !step.choices.some((c) => optionOpenFor(g, c, p).open)
      : prog.pick === null && !node.options.some((o) => optionOpenFor(g, o, p).open)
    if (stuck) {
      prog.step = null
      prog.done = true
      prog.lines.push('정신을 잃어 더는 움직이지 못했다.')
      promoteLater(g, p.id)
    }
  }
  if (!run.players.every((p) => run.personal[p.id]?.done)) return
  for (const p of run.players) promoteLater(g, p.id)

  const picks = { ...run.picks }
  const priv: Record<string, PrivateResult> = {}
  let any = false
  for (const p of run.players) {
    const prog = run.personal[p.id]
    priv[p.id] = { text: prog.lines.join('\n'), changes: prog.changes }
    if (prog.lines.length > 0 || prog.changes.length > 0) any = true
  }
  const next = route(sc, g, node.next)
  if (!any) {
    go(sc, g, next)
    return
  }
  run.result = {
    kind: 'personal',
    nodeId: node.id,
    picks,
    options: node.options.map((o) => ({ id: o.id, text: evalText(o.text, { run }) })),
    text: '',
    private: priv,
    changes: [],
    next,
  }
  run.phase = 'result'
  run.ready = []
  run.picks = {}
  run.personal = {}
}
