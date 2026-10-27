// 전수 탐색기: 시나리오의 모든 길을 실제 엔진으로 돌려 본다.
// 판정에 난수가 없어서(판마다 바뀌는 값도 후보를 하나씩 고정해 전부 돌린다) "모든 엔딩에 닿을 수 있는지,
// 어디서 갇히는지, 각 엔딩까지 최소 몇 걸음인지"를 추측이 아니라 실제로 확인할 수 있다.
//
// 탐색의 단위는 "한 걸음(매크로 행동)"이다:
//  - 읽기·결과: 전원이 계속
//  - 투표: **전원이 같은 선택지**를 고른다 (다수결이라 어떤 선택지든 이길 수 있고, 득표 분포는 결과를 바꾸지 않는다)
//  - 분할: 정원(`max`)을 지키는 모든 행동 조합
//  - 개인: 아직 안 끝난 첫 사람의 다음 선택 하나 (개인 행동은 대부분 서로 독립이라 사람 순서대로 한 명씩 진행하는 것으로 본다 —
//    다른 사람의 상태에 따라 달라지는 개인 선택지의 모든 끼어들기 순서까지는 보지 않는다)
import {
  actionState,
  createScenarioGame,
  currentNode,
  findStep,
  openVoteChoices,
  reduceScenario,
  soloChoiceState,
  splitPickers,
  voters,
  personalOptionState,
  type ScenarioAction,
} from './game.ts'
import { evalText } from './logic.ts'
import type { ScenarioGame } from './state.ts'
import type { EndingTier, Scenario } from './types.ts'

export interface PartyMember {
  id: string
  name: string
  archetype?: string
}

export interface ExploreOptions {
  /** 함께하는 사람들 (인원과 입사 배경). 인원이 늘면 분할 장면의 경우의 수가 크게 늘어난다. */
  players: PartyMember[]
  /** 무작위 값 조합 하나당 이만큼의 상태까지만 본다 (넘으면 잘렸다고 표시). 기본 100,000 */
  maxStates?: number
  /**
   * 탐색 순서. `guided`(기본)는 가장 덜 펼친 장면부터 꺼내서 깊은 장면(엔딩)에 빨리 닿게 한다 — 상태가 많은 시나리오에 알맞고,
   * 길은 최단에 가깝게 남긴다. `bfs`는 가까운 상태부터 모두 펼쳐 최단 경로가 정확하지만 큰 시나리오에서는 엔딩에 닿기 전에 한도에 걸린다.
   */
  strategy?: 'bfs' | 'guided'
  /** 무작위 값 조합이 이보다 많으면 앞에서부터 이만큼만 본다. 기본 64 */
  maxCombos?: number
  /** true면 무작위 값 조합을 모두 돌린다. 아니면 조합이 6개를 넘을 때 각 후보가 한 번씩 나오는 최소 조합만 본다. */
  full?: boolean
  /** 무작위 값 조합을 직접 정한다 (없으면 시나리오의 `vars` 후보를 전부 곱한다) */
  combos?: Record<string, string | number>[]
}

export interface PathStep {
  /** 어느 장면에서 한 걸음인지 */
  nodeId: string
  label: string
}

export interface EndingReport {
  id: string
  title: string
  tier: EndingTier
  /** 이 엔딩에 닿을 수 있었던 무작위 값 조합의 수 */
  reachableCombos: number
  /** 가장 짧은 길 (닿지 못했으면 null) */
  shortest: { combo: Record<string, string | number>; steps: PathStep[] } | null
}

export interface ProblemReport {
  combo: Record<string, string | number>
  /** 이 문제에 해당하는 상태의 수 */
  states: number
  /** 문제의 상태까지 가는 가장 짧은 길 (예시) */
  path: PathStep[]
}

export interface GraphEdge {
  from: string
  to: string
  labels: string[]
}

export interface ExploreReport {
  scenarioId: string
  players: number
  combos: number
  /** 탐색한 서로 다른 상태의 총수 */
  states: number
  /** 상태가 너무 많아 일부만 본 조합이 있는지 (그러면 "닿을 수 없다"는 결론은 확정이 아니다) */
  truncated: boolean
  elapsedMs: number
  endings: EndingReport[]
  /** 한 번도 지나가지 못한 장면 */
  unvisitedNodes: string[]
  /** 한 번도 고르지 못한 선택지·행동 (`장면.선택지`) */
  untakenChoices: string[]
  /** 거기서는 어떤 길로도 엔딩에 닿을 수 없는 상태 (갇힘) */
  deadEnds: ProblemReport[]
  /** 더 진행할 수 없는 상태 (엔진이 멈춤) */
  stuck: ProblemReport[]
  /** 무작위 값 조합별로 닿은 엔딩 */
  comboSummary: { combo: Record<string, string | number>; states: number; endings: string[] }[]
  /** 장면 수준의 분기 그래프 (모든 조합을 합친 것) */
  graph: { nodes: string[]; edges: GraphEdge[] }
}

export interface ExploreProgress {
  combo: number
  combos: number
  states: number
  queued: number
  done: boolean
}

// ───────────────────────── 한 걸음(매크로 행동) ─────────────────────────

interface Macro {
  label: string
  actions: ScenarioAction[]
  /** 이 걸음으로 고른 선택지·행동 (`장면.선택지`) */
  taken: string[]
}

function macrosOf(sc: Scenario, g: ScenarioGame): Macro[] {
  const run = g.run
  const node = currentNode(sc, g)
  const title = node.title ?? node.id
  const ctx = { run }
  const everyone = run.players.map((p) => p.id)
  const ready = (id: string): ScenarioAction => ({ type: 'ready', playerId: id })

  if (run.phase === 'story') return [{ label: `${title}: 계속`, actions: everyone.map(ready), taken: [] }]
  if (run.phase === 'result') return [{ label: `${title}: 결과를 읽고 계속`, actions: everyone.map(ready), taken: [] }]

  if (run.phase === 'vote' && node.kind === 'vote') {
    const who = voters(g)
    return openVoteChoices(g, node).map((c) => ({
      label: `${title}: 전원→${evalText(c.text, ctx)}`,
      actions: who.map((p): ScenarioAction => ({ type: 'vote', playerId: p.id, choiceId: c.id })),
      taken: [`${node.id}.${c.id}`],
    }))
  }

  if (run.phase === 'split' && node.kind === 'split') {
    const pickers = splitPickers(g, node)
    const out: Macro[] = []
    const chosen: { who: string; name: string; action: string; text: string }[] = []
    const counts = new Map<string, number>()
    const walk = (i: number): void => {
      if (i === pickers.length) {
        // 인원이 모자란 행동이 남는 조합은 장면이 진행되지 않으므로 한 걸음이 아니다
        if (node.actions.some((a) => a.min !== undefined && (counts.get(a.id) ?? 0) > 0 && (counts.get(a.id) ?? 0) < a.min)) return
        out.push({
          label: `${title}: ${chosen.map((c) => `${c.name}→${c.text}`).join(', ')}`,
          actions: chosen.map((c): ScenarioAction => ({ type: 'pick', playerId: c.who, actionId: c.action })),
          taken: chosen.map((c) => `${node.id}.${c.action}`),
        })
        return
      }
      const p = pickers[i]
      for (const a of node.actions) {
        if (!actionState(g, a, p.id).open) continue
        if (a.max !== undefined && (counts.get(a.id) ?? 0) >= a.max) continue
        counts.set(a.id, (counts.get(a.id) ?? 0) + 1)
        chosen.push({ who: p.id, name: p.name, action: a.id, text: evalText(a.text, ctx) })
        walk(i + 1)
        chosen.pop()
        counts.set(a.id, (counts.get(a.id) ?? 0) - 1)
      }
    }
    walk(0)
    return out
  }

  if (run.phase === 'personal' && node.kind === 'personal') {
    // 아직 아무도 적용되지 않은 동안에는 안 고른 첫 사람이 하나를 고른다 (모두 고르면 엔진이 한꺼번에 적용한다)
    const undecided = run.players.find((x) => {
      const pr = run.personal[x.id]
      return pr && !pr.done && !pr.committed && pr.pick === null
    })
    const p = undecided ?? run.players.find((x) => !run.personal[x.id]?.done)
    if (!p) return []
    const prog = run.personal[p.id]
    if (undecided) {
      return node.options
        .filter((o) => personalOptionState(g, o, p.id).open)
        .map((o) => ({
          label: `${title}: ${p.name}→${evalText(o.text, ctx)}`,
          actions: [{ type: 'pick', playerId: p.id, actionId: o.id } as ScenarioAction],
          taken: [`${node.id}.${o.id}`],
        }))
    }
    if (prog.step) {
      const step = findStep(node, prog.step)
      if (step.choices?.length) {
        return step.choices
          .filter((c) => soloChoiceState(g, c, p.id).open)
          .map((c) => ({
            label: `${title}: ${p.name}→${evalText(c.text, ctx)}`,
            actions: [{ type: 'solo', playerId: p.id, choiceId: c.id } as ScenarioAction],
            taken: [`${node.id}.${step.id}.${c.id}`],
          }))
      }
      return [{ label: `${title}: ${p.name}가 계속`, actions: [ready(p.id)], taken: [] }]
    }
  }
  return []
}

function apply(sc: Scenario, g: ScenarioGame, m: Macro): ScenarioGame | null {
  let cur = g
  for (const a of m.actions) {
    const next = reduceScenario(sc, cur, a)
    if (next === cur) return null // 규칙에 맞지 않는 조합 (정원 초과 등)
    cur = next
  }
  return cur
}

/**
 * 시나리오가 실제로 "읽는" 것만 모은다. 어떤 조건도 보지 않는 사실·아이템·스텟은 달라도 길이 달라지지 않으므로
 * 상태를 구분할 때 빼서, 같은 상황을 하나로 묶는다 (탐색해야 할 상태 수가 크게 줄어든다).
 * 정신력은 정신을 잃는지(0)와 엔딩에 쓰이므로 언제나 구분한다.
 */
interface Relevance {
  facts: Set<string>
  items: Set<string>
  stats: Set<string>
  /**
   * 스텟을 깎는 효과가 없고 "이상"(min) 조건만 있는 스텟은 가장 큰 기준선 이상이면 모두 같다 (더 올라도, 내려갈 일이 없어서).
   * 그런 스텟은 기준선에서 잘라 비교한다.
   */
  caps: Partial<Record<string, number>>
}

function relevanceOf(sc: Scenario): Relevance {
  const rel: Relevance = { facts: new Set(), items: new Set(), stats: new Set(['sanity']), caps: {} }
  const mins = new Map<string, number>()
  const hasMax = new Set<string>()
  const negative = new Set<string>()
  const isTextBlock = (o: Record<string, unknown>) => Object.keys(o).every((k) => k === 'text' || k === 'when')
  const walk = (v: unknown, inText = false): void => {
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, inText))
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      // 글에 붙은 조건은 어떤 문장을 보여 줄지만 바꾸고 길을 바꾸지 않는다
      if (isTextBlock(o) && typeof o.text === 'string') return
      if (typeof o.knows === 'string') rel.facts.add(o.knows)
      if (typeof o.item === 'string') rel.items.add(o.item)
      if (typeof o.stat === 'string') {
        if ('min' in o || 'max' in o) {
          rel.stats.add(o.stat)
          if (typeof o.min === 'number') mins.set(o.stat, Math.max(mins.get(o.stat) ?? 0, o.min))
          if ('max' in o) hasMax.add(o.stat)
        } else if (typeof o.add === 'number' && o.add < 0) {
          negative.add(o.stat)
        }
      }
      Object.values(o).forEach((x) => walk(x, inText))
    }
  }
  walk(sc.nodes)
  for (const [stat, min] of mins) {
    if (!negative.has(stat) && !hasMax.has(stat)) rel.caps[stat] = min
  }
  return rel
}

/** 같은 상황이면 같은 문자열이 되게 한다: 글·기록·여파는 빼고 규칙에 영향을 주는 것만 */
function stateKey(g: ScenarioGame, rel: Relevance): string {
  const r = g.run
  const sorted = (xs: string[]) => [...xs].sort().join(',')
  const entries = (o: Record<string, string>) => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)).join(';')
  return [
    r.nodeId,
    r.phase,
    r.time,
    r.period,
    sorted(r.flags),
    r.players
      .map((p) => {
        const stats = (['sanity', 'body', 'insight', 'luck'] as const)
          .filter((k) => rel.stats.has(k))
          .map((k) => Math.min(p.stats[k], rel.caps[k] ?? 99))
        return `${p.id}:${stats.join('.')}:${sorted(p.items.filter((i) => rel.items.has(i)))}:${sorted(p.facts.filter((f) => rel.facts.has(f)))}:${p.hurt ? 1 : 0}`
      })
      .join('|'),
    entries(r.votes),
    entries(r.picks),
    Object.entries(r.personal)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, p]) => `${id}:${p.pick}:${p.committed ? 1 : 0}:${p.step}:${p.done ? 1 : 0}:${JSON.stringify(p.later)}`)
      .join('|'),
    JSON.stringify(r.pending),
    sorted(r.ready),
    r.result ? `${r.result.nodeId}>${r.result.next}` : '',
    r.endingId ?? '',
  ].join('#')
}

// ───────────────────────── 탐색 ─────────────────────────

class ComboSearch {
  readonly ids = new Map<string, number>()
  readonly parent: number[] = []
  readonly via: string[] = []
  readonly viaNode: string[] = []
  readonly depth: number[] = []
  readonly forward: number[][] = []
  readonly ending: (string | null)[] = []
  /** 펼쳐 본 상태인지 */
  readonly expanded: boolean[] = []
  /** 상태가 너무 많아 일부 다음 상태를 버린 상태들 (이 아래는 모르는 것이다) */
  readonly cut = new Set<number>()
  readonly stuckIds: number[] = []
  /** 장면별로 나눈 대기열: 지금까지 가장 덜 펼친 장면부터 꺼내서 깊은 장면에 빨리 닿게 한다 (`guided`). `bfs`는 하나의 줄. */
  private readonly buckets = new Map<string, { items: { id: number; game: ScenarioGame }[]; head: number }>()
  private readonly expandedPerBucket = new Map<string, number>()
  pending = 0
  expandedCount = 0
  truncated = false

  private readonly sc: Scenario
  readonly combo: Record<string, string | number>
  private readonly maxStates: number
  private readonly rel: Relevance
  private readonly strategy: 'bfs' | 'guided'
  private readonly visited: Set<string>
  private readonly taken: Set<string>
  private readonly edges: Map<string, { from: string; to: string; labels: Set<string> }>

  constructor(
    sc: Scenario,
    combo: Record<string, string | number>,
    players: PartyMember[],
    maxStates: number,
    rel: Relevance,
    strategy: 'bfs' | 'guided',
    visited: Set<string>,
    taken: Set<string>,
    edges: Map<string, { from: string; to: string; labels: Set<string> }>,
  ) {
    this.sc = sc
    this.combo = combo
    this.maxStates = maxStates
    this.rel = rel
    this.strategy = strategy
    this.visited = visited
    this.taken = taken
    this.edges = edges
    const start = createScenarioGame(sc, { seed: 1, players, vars: combo })
    this.add(start, -1, '', '', 0)
  }

  private bucketKey(g: ScenarioGame): string {
    return this.strategy === "bfs" ? "all" : `${g.run.nodeId}|${g.run.phase}|${g.run.time}|${g.run.period}|${[...g.run.flags].sort().join(",")}`
  }

  private add(g: ScenarioGame, parent: number, via: string, viaNode: string, depth: number): number {
    const key = stateKey(g, this.rel)
    const found = this.ids.get(key)
    if (found !== undefined) {
      // 더 짧은 길로 다시 닿았다면 길을 고친다 (안내문이 최단에 가깝게 남도록)
      if (depth < this.depth[found]) {
        this.parent[found] = parent
        this.via[found] = via
        this.viaNode[found] = viaNode
        this.depth[found] = depth
      }
      return found
    }
    const id = this.ids.size
    this.ids.set(key, id)
    this.parent.push(parent)
    this.via.push(via)
    this.viaNode.push(viaNode)
    this.depth.push(depth)
    this.forward.push([])
    this.ending.push(g.run.endingId)
    this.expanded.push(false)
    const bk = this.bucketKey(g)
    let bucket = this.buckets.get(bk)
    if (!bucket) {
      bucket = { items: [], head: 0 }
      this.buckets.set(bk, bucket)
    }
    bucket.items.push({ id, game: g })
    this.pending++
    return id
  }

  get finished(): boolean {
    return this.pending === 0
  }

  private next(): { id: number; game: ScenarioGame } | null {
    let best: string | null = null
    let bestCount = Infinity
    for (const [key, b] of this.buckets) {
      if (b.head >= b.items.length) continue
      const count = this.expandedPerBucket.get(key) ?? 0
      if (count < bestCount) {
        best = key
        bestCount = count
      }
    }
    if (best === null) return null
    const bucket = this.buckets.get(best)!
    const item = bucket.items[bucket.head]
    bucket.items[bucket.head++] = undefined as never // 펼친 상태의 게임 객체는 더 쓰지 않으니 메모리를 돌려준다
    this.expandedPerBucket.set(best, bestCount + 1)
    this.pending--
    return item
  }

  /** 상태를 `budget`개까지 펼친다 */
  step(budget: number): void {
    for (let n = 0; n < budget; n++) {
      const item = this.next()
      if (!item) return
      const { id, game } = item
      this.expanded[id] = true
      this.expandedCount++
      this.visited.add(game.run.nodeId)
      if (game.run.phase === 'ended') continue

      const macros = macrosOf(this.sc, game)
      let moved = 0
      for (const m of macros) {
        const next = apply(this.sc, game, m)
        if (!next) continue
        moved++
        m.taken.forEach((t) => this.taken.add(t))
        const fromNode = game.run.nodeId
        const toNode = next.run.nodeId
        if (fromNode !== toNode || next.run.phase !== game.run.phase) {
          const ek = `${fromNode}>${toNode}`
          const e = this.edges.get(ek) ?? { from: fromNode, to: toNode, labels: new Set<string>() }
          if (e.labels.size < 12) e.labels.add(m.label)
          this.edges.set(ek, e)
        }
        if (this.ids.size >= this.maxStates && !this.ids.has(stateKey(next, this.rel))) {
          this.truncated = true
          this.cut.add(id)
          continue
        }
        const to = this.add(next, id, m.label, fromNode, this.depth[id] + 1)
        this.forward[id].push(to)
      }
      if (moved === 0) this.stuckIds.push(id)
    }
  }

  pathTo(id: number): PathStep[] {
    const steps: PathStep[] = []
    const seen = new Set<number>()
    for (let cur = id; this.parent[cur] >= 0 && !seen.has(cur); cur = this.parent[cur]) {
      seen.add(cur)
      steps.push({ nodeId: this.viaNode[cur], label: this.via[cur] })
    }
    return steps.reverse()
  }

  /**
   * 엔딩에 닿을 수 있는 상태들을 거꾸로 찾아서, 닿을 수 없는 상태를 돌려준다.
   * 아직 펼치지 못했거나 아래가 잘린 상태는 "모른다"이므로 닿을 수 있는 것으로 보고, 갇힌 것으로 세지 않는다.
   */
  deadStates(): number[] {
    const n = this.ids.size
    const reverse: number[][] = Array.from({ length: n }, () => [])
    for (let from = 0; from < n; from++) for (const to of this.forward[from]) reverse[to].push(from)
    const good = new Uint8Array(n)
    const stack: number[] = []
    for (let i = 0; i < n; i++) {
      if (this.ending[i] || !this.expanded[i] || this.cut.has(i)) {
        good[i] = 1
        stack.push(i)
      }
    }
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const prev of reverse[cur]) {
        if (!good[prev]) {
          good[prev] = 1
          stack.push(prev)
        }
      }
    }
    const dead: number[] = []
    for (let i = 0; i < n; i++) if (!good[i]) dead.push(i)
    return dead
  }
}

/** 각 무작위 값의 모든 후보가 적어도 한 조합에는 들어가는 최소한의 조합들 (값들을 같은 자리끼리 짝지음) */
function covering(sc: Scenario): Record<string, string | number>[] {
  const vars = sc.vars ?? []
  const n = Math.max(1, ...vars.map((v) => v.pick.length))
  return Array.from({ length: n }, (_, i) => Object.fromEntries(vars.map((v) => [v.id, v.pick[i % v.pick.length]])))
}

function cartesian(sc: Scenario, max: number): Record<string, string | number>[] {
  let combos: Record<string, string | number>[] = [{}]
  for (const v of sc.vars ?? []) {
    combos = combos.flatMap((c) => v.pick.map((val) => ({ ...c, [v.id]: val })))
    if (combos.length > max) combos = combos.slice(0, max)
  }
  return combos
}

export class Explorer {
  private readonly combos: Record<string, string | number>[]
  private index = 0
  private search: ComboSearch | null = null
  private readonly visited = new Set<string>()
  private readonly taken = new Set<string>()
  private readonly edges = new Map<string, { from: string; to: string; labels: Set<string> }>()
  private readonly started = Date.now()
  private states = 0
  private truncated = false
  private readonly endingHits = new Map<string, { combos: Set<number>; best: { depth: number; combo: Record<string, string | number>; steps: PathStep[] } | null }>()
  private readonly deadEnds: ProblemReport[] = []
  private readonly stuck: ProblemReport[] = []
  private readonly comboSummary: ExploreReport['comboSummary'] = []

  private readonly sc: Scenario
  private readonly options: ExploreOptions
  private readonly rel: Relevance

  constructor(sc: Scenario, options: ExploreOptions) {
    this.sc = sc
    this.options = options
    this.rel = relevanceOf(sc)
    // 조합이 많으면(곱이 6을 넘으면) 각 후보가 한 번씩 나오는 최소 조합만 본다. `full`이면 전부.
    const full = cartesian(sc, options.maxCombos ?? 64)
    this.combos = options.combos ?? (options.full || full.length <= 6 ? full : covering(sc))
    for (const n of sc.nodes) if (n.kind === 'ending') this.endingHits.set(n.id, { combos: new Set(), best: null })
  }

  get progress(): ExploreProgress {
    const s = this.search
    return {
      combo: Math.min(this.index + 1, this.combos.length),
      combos: this.combos.length,
      states: this.states + (s?.ids.size ?? 0),
      queued: s ? s.pending : 0,
      done: this.index >= this.combos.length,
    }
  }

  /** 상태를 `budget`개까지 펼친다. 끝나면 true. */
  run(budget: number): boolean {
    let left = budget
    while (this.index < this.combos.length && left > 0) {
      if (!this.search) {
        this.search = new ComboSearch(
          this.sc,
          this.combos[this.index],
          this.options.players,
          this.options.maxStates ?? 100_000,
          this.rel,
          this.options.strategy ?? 'guided',
          this.visited,
          this.taken,
          this.edges,
        )
      }
      const before = this.search.expandedCount
      this.search.step(left)
      left -= Math.max(1, this.search.expandedCount - before)
      if (this.search.finished) {
        this.finishCombo(this.search)
        this.search = null
        this.index++
      }
    }
    return this.index >= this.combos.length
  }

  private finishCombo(s: ComboSearch): void {
    this.states += s.ids.size
    this.truncated ||= s.truncated

    const reached = new Set<string>()
    for (let id = 0; id < s.ids.size; id++) {
      const end = s.ending[id]
      if (!end) continue
      reached.add(end)
      const hit = this.endingHits.get(end)
      if (!hit) continue
      hit.combos.add(this.index)
      const steps = s.pathTo(id)
      if (!hit.best || steps.length < hit.best.depth) hit.best = { depth: steps.length, combo: s.combo, steps }
    }
    this.comboSummary.push({ combo: s.combo, states: s.ids.size, endings: [...reached].sort() })

    const dead = s.deadStates()
    if (dead.length > 0) this.deadEnds.push({ combo: s.combo, states: dead.length, path: s.pathTo(dead[0]) })
    if (s.stuckIds.length > 0) this.stuck.push({ combo: s.combo, states: s.stuckIds.length, path: s.pathTo(s.stuckIds[0]) })
  }

  report(): ExploreReport {
    const sc = this.sc
    const allChoices: string[] = []
    for (const n of sc.nodes) {
      if (n.kind === 'vote') n.choices.forEach((c) => allChoices.push(`${n.id}.${c.id}`))
      else if (n.kind === 'split') n.actions.forEach((a) => allChoices.push(`${n.id}.${a.id}`))
      else if (n.kind === 'personal') {
        n.options.forEach((o) => allChoices.push(`${n.id}.${o.id}`))
        for (const st of n.steps ?? []) st.choices?.forEach((c) => allChoices.push(`${n.id}.${st.id}.${c.id}`))
      }
    }
    return {
      scenarioId: sc.id,
      players: this.options.players.length,
      combos: this.combos.length,
      states: this.states,
      truncated: this.truncated,
      elapsedMs: Date.now() - this.started,
      endings: sc.nodes
        .filter((n) => n.kind === 'ending')
        .map((n) => {
          const hit = this.endingHits.get(n.id)!
          return {
            id: n.id,
            title: n.title ?? n.id,
            tier: n.kind === 'ending' ? n.tier : 'neutral',
            reachableCombos: hit.combos.size,
            shortest: hit.best ? { combo: hit.best.combo, steps: hit.best.steps } : null,
          }
        }),
      unvisitedNodes: sc.nodes.map((n) => n.id).filter((id) => !this.visited.has(id)),
      untakenChoices: allChoices.filter((k) => !this.taken.has(k)),
      deadEnds: this.deadEnds,
      stuck: this.stuck,
      comboSummary: this.comboSummary,
      graph: {
        nodes: sc.nodes.map((n) => n.id),
        edges: [...this.edges.values()].map((e) => ({ from: e.from, to: e.to, labels: [...e.labels] })),
      },
    }
  }
}

/** 끝까지 한 번에 돌린다 (CLI·테스트용). 화면에서는 `Explorer`를 나눠서 돌려 진행률을 보인다. */
export function exploreScenario(sc: Scenario, options: ExploreOptions): ExploreReport {
  const ex = new Explorer(sc, options)
  while (!ex.run(2000)) {
    // 계속
  }
  return ex.report()
}

/** 사람이 읽는 요약 (CLI 출력용). 문제가 있으면 `ok`가 false다. */
export function formatReport(sc: Scenario, r: ExploreReport): { ok: boolean; text: string } {
  const lines: string[] = []
  let ok = true
  lines.push(`${sc.code} ${sc.name} — ${r.players}명 · 무작위 값 조합 ${r.combos}개 · 상태 ${r.states.toLocaleString()}개 · ${r.elapsedMs}ms${r.truncated ? ' · (일부만 봄)' : ''}`)
  for (const e of r.endings) {
    // 일부만 본 탐색에서 못 찾은 엔딩은 "없다"가 아니라 "아직 모른다"
    const unknown = r.truncated && e.reachableCombos < r.combos
    const mark = e.reachableCombos === r.combos ? '✓' : unknown ? '?' : e.reachableCombos === 0 ? '✗' : '△'
    if (e.reachableCombos === 0 && !r.truncated) ok = false
    lines.push(
      `  ${mark} ${e.tier.padEnd(7)} ${e.title} — ${e.reachableCombos}/${r.combos}조합${e.shortest ? `, 최단 ${e.shortest.steps.length}걸음` : ''}`,
    )
  }
  if (r.unvisitedNodes.length > 0) lines.push(`  지나가지 못한 장면: ${r.unvisitedNodes.join(', ')}`)
  if (r.untakenChoices.length > 0) lines.push(`  고르지 못한 선택지: ${r.untakenChoices.join(', ')}`)
  for (const d of r.deadEnds) {
    ok = false
    lines.push(`  ✗ 갇히는 상태 ${d.states}개 (${JSON.stringify(d.combo)}): ${d.path.map((p) => p.label).join(' → ')}`)
  }
  for (const d of r.stuck) {
    ok = false
    lines.push(`  ✗ 진행이 멈추는 상태 ${d.states}개 (${JSON.stringify(d.combo)}): ${d.path.map((p) => p.label).join(' → ')}`)
  }
  return { ok, text: lines.join('\n') }
}
