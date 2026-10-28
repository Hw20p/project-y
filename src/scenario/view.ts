// 플레이어 한 명에게 보여 줄 시나리오 화면 상태. 서버는 `ScenarioGame` 전체가 아니라 이것만 각 클라이언트에 보낸다.
// 단서(사실)는 얻은 사람의 이름과 함께 모두에게 보인다. 다른 사람의 아이템과 비공개 발견의 글(서술)은 여기서 걸러진다.
import { actionState, currentNode, findStep, openVoteChoices, personalOptionState, soloChoiceState } from './game.ts'
import { evalCond, evalText } from './logic.ts'
import type { Change, PrivateResult, RunPhase, ScenarioGame, ScenarioResult } from './state.ts'
import { isPanicked, STAT_LABEL, type Stats } from './stats.ts'
import type { Effect, EndingTier, HintDef, ItemDef, Scenario } from './types.ts'

export interface DossierView {
  id: string
  title: string
  /** 잠겨 있으면 null */
  lines: string[] | null
  /** 잠겨 있을 때 어떻게 열리는지 알려 주는 짧은 안내 */
  lockNote?: string
}

/** 알아낸 단서 하나: 누가 얻었는지 이름이 붙고, 파티 전원에게 보인다 */
export interface ClueView {
  id: string
  text: string
  /** 이번 판에서 이 단서를 얻은 사람들 */
  by: { id: string; name: string }[]
}

/** 조사 보드의 의문 하나 */
export interface BoardQuestionView {
  id: string
  /** 아직 아무도 관련 단서를 모르면 null (의문이 있다는 것도 모른다) */
  text: string | null
  solved: boolean
  /** 지금 풀고 있는 의문인지 (과제를 하나씩 푸는 시나리오에서만) */
  current: boolean
  /** 풀렸을 때만 */
  answer: string | null
  /** 이 의문과 관련해 파티 누구라도 알아낸 단서 (얻은 사람 이름 포함). */
  clues: ClueView[]
}

export interface BoardView {
  goal: string
  questions: BoardQuestionView[]
}

/** 정보 패널의 대상 정보 */
export interface EntityView {
  code: string
  name: string
  type: string
  summary: string
  observation: string[]
  manual: string[]
  /** 대상 자료. 잠긴 항목은 제목만 보이고 내용은 비어 있다. */
  dossier: DossierView[]
}

export interface SceneChoiceView {
  id: string
  text: string
  /** 있으면 잠긴 선택지다 (고를 수 없고 이 문구가 보인다) */
  locked?: string
  /** 투표: 지금 이 선택지를 고른 사람들. 분할: 이 행동을 하고 있는 사람들. */
  pickerIds: string[]
  /** 분할 행동의 정원이 찼는지 */
  full: boolean
  /** 분할 행동에 필요한 최소 인원 (둘이 함께 해야 하는 행동) */
  min?: number
  /** 이 선택지가 주는 성장을 미리 알리는 짧은 표시 (예: "체력 +1", "정신력 +3", "부상 치료"). 개인 행동에서만 있다. */
  hints?: string[]
}

/** 개인 장면에서 내가 지금 혼자 보고 있는 단계 */
export interface SoloView {
  text: string
  /** 이 단계에 들어오며 적용된 변화 (미뤄 둔 효과의 여파 포함) */
  aftermath: Change[]
  /** 비어 있으면 읽고 "계속"을 누르는 단계 */
  choices: SceneChoiceView[]
  /** 지금까지 이 장면에서 나에게만 보인 글 */
  lines: string[]
}

export interface SceneView {
  kind: 'story' | 'vote' | 'split' | 'personal'
  title?: string
  text: string
  /** 이야기 장면: 'success'면 성공 표시를 보인다 */
  tone?: 'success'
  /** 분할 장면의 이름("조사" 등)과 한 줄 설명. 없으면 "조합 · 각자 다른 행동을 고르고, 모두의 조합이 결과를 정한다" */
  label?: string
  hint?: string
  choices: SceneChoiceView[]
  /** 내가 지금 고른 선택지·행동 */
  myChoiceId: string | null
  /** 개인 장면: 내가 혼자 진행 중인 단계 (아직 고르기 전이거나 끝났으면 null) */
  solo: SoloView | null
  /** 개인 장면: 내 개인 행동이 끝났는지 */
  mineDone: boolean
  /**
   * 개인 장면: 고르는 선택지가 전부 자동(`auto`)이라 고르는 화면이 없는 장면(조사 뒤의 파고들기). 이 장면에 들어온 사람은
   * 장면 글과 선택지를 건너뛰고 바로 첫 단계에 선다 — 화면은 이 사람에게 장면 글과 선택지를 보이지 않는다.
   */
  auto: boolean
  /** 개인 장면: 지금까지 나에게만 보인 글 (끝난 뒤에도 남는다) */
  myLines: string[]
}

export interface PlayerView {
  id: string
  name: string
  hurt: boolean
  /** 정신을 잃은 상태 (정신력 0) */
  panic: boolean
  archetype: string
  /** 파티원의 스텟은 모두에게 보인다 — 누가 무엇을 해야 할지 의논하는 근거 */
  stats: Stats
  /** 개인 장면에서의 진행: 고르는 중 / 혼자 진행 중 / 끝남 */
  progress: 'choosing' | 'picked' | 'solo' | 'done' | null
  /** 이번 장면에서 고름을 마쳤는지 (무엇을 골랐는지는 선택지의 `pickerIds`로 보인다) */
  acted: boolean
  /** story·result에서 "계속"을 눌렀는지 */
  ready: boolean
}

export interface ResultView extends Omit<ScenarioResult, 'private' | 'changes'> {
  /** 내가 한 행동에서 나온 비공개 발견 (분할 장면) */
  mine: PrivateResult | null
  /** 모두에게 보이는 변화 (내 것이 아닌 단서 획득은 빠진다) */
  changes: Change[]
}

export interface EndingView {
  id: string
  title: string
  text: string
  tier: EndingTier
  /** 이번에 처음 닿은 엔딩인지 */
  first: boolean
}

export interface ScenarioView {
  mode: 'scenario'
  scenario: { id: string; code: string; name: string; type: string }
  runNo: number
  time: number
  clockLabel: string
  /** 시계가 조명일 때만: 마감까지 조명이 몇 단계이고(`max`) 지금 몇 단계나 어두워졌는지(`level`) */
  light: { max: number; level: number; name?: string } | null
  /** 조명이 아닌 시계를 막대로 보이는 경우: 막대의 이름("남은 밤" 등), 마감까지 칸 수(`max`), 지금까지 흐른 칸(`level`) */
  meter: { name: string; max: number; level: number } | null
  phase: RunPhase
  me: { id: string; name: string; hurt: boolean; panic: boolean; stats: Stats; items: ItemDef[]; facts: HintDef[] }
  players: PlayerView[]
  /** 며칠째 낮/밤인지 (시나리오가 장면에 시간대를 정해 둔 경우에만) */
  timeOfDay: { day: number; period: 'day' | 'night' } | null
  /** 정보 패널(대상 정보)용. 대상 자료는 이번 판에서 파티 누구라도 알아낸 단서에 따라 열린다. */
  entity: EntityView
  /** 이번 판에서 파티 누구라도 알아낸 단서 전부 (얻은 사람 이름 포함). 알아낸 순서대로. */
  clues: ClueView[]
  /** 조사 보드 (시나리오에 있을 때만) */
  board: BoardView | null
  /** 아이템 id → 이름 (변화 칩에 "○○ 획득"을 쓰기 위함) */
  itemNames: Record<string, string>
  /** 이 장면에 들어오며 적용된 변화: 지난 선택의 **여파**(`later`)와 이 장면의 진입 효과. 아이템은 본인 것만, 단서는 모두의 것이 보인다. */
  aftermath: Change[]
  scene: SceneView | null
  result: ResultView | null
  ending: EndingView | null
  /** 닿아 본 엔딩. 총 몇 개인지는 알려 주지만 아직 안 닿은 엔딩의 내용은 숨긴다. */
  endings: { reached: { id: string; title: string; tier: EndingTier; count: number }[]; total: number }
}

/** 스텟 상승·치료처럼 고르기 전에 알려 줘도 되는 효과만 표시로 만든다. 단서·아이템 같은 발견과 미뤄 둔 대가는 숨긴다. */
function growthHints(effects: Effect[] | undefined): string[] {
  const out: string[] = []
  for (const e of effects ?? []) {
    if ('stat' in e && e.add > 0 && e.to === 'actor') out.push(`${STAT_LABEL[e.stat]} +${e.add}`)
    else if ('heal' in e && e.heal === 'actor') out.push('부상 치료')
  }
  return out
}

const BASE_SCENE = { choices: [], myChoiceId: null, solo: null, mineDone: false, auto: false, myLines: [] } satisfies Partial<SceneView>

/** 투표 선택지의 섞인 순서를 정하는 값: 판의 시드·장면·선택지로 정해지므로 모두에게 같고, 다시 그려도 바뀌지 않는다 */
function orderKey(seed: number, nodeId: string, choiceId: string): number {
  let h = (seed ^ 2166136261) >>> 0
  for (const ch of `${nodeId}:${choiceId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/** `shuffle`인 투표 장면의 선택지를 판마다 다른 순서로 놓는다 */
function shuffled(node: { id: string; shuffle?: boolean }, seed: number, shown: SceneChoiceView[]): SceneChoiceView[] {
  if (!node.shuffle) return shown
  return [...shown].sort((a, b) => orderKey(seed, node.id, a.id) - orderKey(seed, node.id, b.id))
}

/** 분할 장면에서 함께할 사람이 더 필요한 행동들 (고른 사람이 있지만 최소 인원에 못 미친다). 있으면 장면이 진행되지 않는다. */
export function needMoreChoiceIds(scene: SceneView | null): string[] {
  if (scene?.kind !== 'split') return []
  return scene.choices.filter((c) => c.min !== undefined && c.pickerIds.length > 0 && c.pickerIds.length < c.min).map((c) => c.id)
}

/** 변화 중 이 사람에게 보여 줄 것: 아이템·단서는 본인 것만, 나머지(스텟·부상·시간)는 모두에게 */
function visibleTo(changes: Change[], playerId: string): Change[] {
  return changes.filter((c) => c.kind !== 'item' || c.playerId === playerId)
}

export function viewForScenario(sc: Scenario, g: ScenarioGame, playerId: string): ScenarioView {
  const run = g.run
  const me = run.players.find((p) => p.id === playerId)
  if (!me) throw new Error(`알 수 없는 플레이어: ${playerId}`)
  const node = currentNode(sc, g)
  const ctx = { run, viewer: playerId }

  // ───── 장면
  let scene: SceneView | null = null
  if (node.kind === 'story') {
    scene = { ...BASE_SCENE, kind: 'story', title: node.title, text: evalText(node.text, ctx), ...(node.tone ? { tone: node.tone } : {}) }
  } else if (node.kind === 'vote' && run.phase === 'vote') {
    const open = openVoteChoices(g, node)
    const openIds = new Set(open.map((c) => c.id))
    scene = {
      ...BASE_SCENE,
      kind: 'vote',
      title: node.title,
      text: evalText(node.text, ctx),
      choices: shuffled(
        node,
        run.seed,
        node.choices.flatMap((c): SceneChoiceView[] => {
          const pickerIds = run.players.filter((p) => run.votes[p.id] === c.id).map((p) => p.id)
          if (openIds.has(c.id)) return [{ id: c.id, text: evalText(c.text, ctx), pickerIds, full: false }]
          return c.locked ? [{ id: c.id, text: evalText(c.text, ctx), locked: c.locked, pickerIds: [], full: false }] : []
        }),
      ),
      myChoiceId: run.votes[playerId] ?? null,
    }
  } else if (node.kind === 'split' && run.phase === 'split') {
    scene = {
      ...BASE_SCENE,
      kind: 'split',
      title: node.title,
      ...(node.label ? { label: node.label } : {}),
      ...(node.hint ? { hint: node.hint } : {}),
      text: evalText(node.text, ctx),
      choices: node.actions.flatMap((a): SceneChoiceView[] => {
        const st = actionState(g, a, playerId)
        const pickerIds = run.players.filter((p) => run.picks[p.id] === a.id).map((p) => p.id)
        const full = a.max !== undefined && pickerIds.length >= a.max
        const min = a.min
        if (st.open) return [{ id: a.id, text: evalText(a.text, ctx), pickerIds, full, min }]
        // 내가 지금 이 행동을 하고 있다면(정원이 찬 경우 포함) 잠긴 것이 아니라 내 선택이다
        if (run.picks[playerId] === a.id) return [{ id: a.id, text: evalText(a.text, ctx), pickerIds, full, min }]
        return st.reason ? [{ id: a.id, text: evalText(a.text, ctx), locked: st.reason, pickerIds, full, min }] : []
      }),
      myChoiceId: run.picks[playerId] ?? null,
    }
  }

  else if (node.kind === 'personal' && run.phase === 'personal') {
    const prog = run.personal[playerId]
    const picked = prog?.pick ?? null
    const step = prog?.step ? findStep(node, prog.step) : null
    scene = {
      ...BASE_SCENE,
      kind: 'personal',
      title: node.title,
      text: evalText(node.text, ctx),
      choices: node.options.flatMap((o): SceneChoiceView[] => {
        const st = personalOptionState(g, o, playerId)
        const pickerIds = run.players.filter((p) => run.picks[p.id] === o.id).map((p) => p.id)
        const view = { id: o.id, text: evalText(o.text, ctx), pickerIds, full: false, hints: growthHints(o.effects) }
        if (st.open || picked === o.id) return [view]
        return st.reason ? [{ ...view, locked: st.reason }] : []
      }),
      myChoiceId: picked,
      mineDone: !!prog?.done,
      auto: node.options.length > 0 && node.options.every((o) => o.auto),
      myLines: prog?.lines ?? [],
      solo: step
        ? {
            text: evalText(step.text, ctx),
            aftermath: visibleTo(prog?.stepChanges ?? [], playerId),
            choices: (step.choices ?? []).flatMap((c): SceneChoiceView[] => {
              const st = soloChoiceState(g, c, playerId)
              const view = { id: c.id, text: evalText(c.text, ctx), pickerIds: [], full: false }
              if (st.open) return [view]
              return st.reason ? [{ ...view, locked: st.reason }] : []
            }),
            lines: prog?.lines ?? [],
          }
        : null,
    }
  }

  // ───── 결과 (사람마다 걸러서)
  let result: ResultView | null = null
  if (run.phase === 'result' && run.result) {
    const { private: priv, changes, ...rest } = run.result
    // 부상·치료·스텟은 파티원 줄에 보이는 사실이고, 단서는 얻은 사람의 이름과 함께 공개되므로 누가 겪었든 모두에게 보인다.
    // 아이템 획득과 비공개 발견의 글만 본인에게 보인다.
    const visible = (c: Change) => c.kind === 'hurt' || c.kind === 'heal' || c.kind === 'stat' || c.kind === 'fact'
    const mine = priv[playerId]
    result = {
      ...rest,
      mine: mine ? { text: mine.text, changes: mine.changes.filter((c) => !visible(c)) } : null,
      changes: [...changes, ...Object.values(priv).flatMap((p) => p.changes.filter(visible))],
    }
  }

  // ───── 엔딩
  let ending: EndingView | null = null
  if (run.phase === 'ended' && node.kind === 'ending') {
    ending = {
      id: node.id,
      title: node.title ?? node.id,
      text: evalText(node.text, ctx),
      tier: node.tier,
      first: (g.endings[node.id] ?? 0) === 1,
    }
  }

  // ───── 단서: 파티 누구라도 알아낸 것은 얻은 사람의 이름과 함께 모두에게 보인다
  const foundBy = new Map<string, { id: string; name: string }[]>() // 알아낸 순서대로 (사람 순서, 사람마다 얻은 순서)
  for (const p of run.players) {
    for (const id of p.facts) {
      const list = foundBy.get(id) ?? []
      list.push({ id: p.id, name: p.name })
      foundBy.set(id, list)
    }
  }
  const clueOf = (id: string): ClueView | null => {
    const f = sc.facts.find((x) => x.id === id)
    return f ? { id, text: f.text, by: foundBy.get(id) ?? [] } : null
  }
  const nonNull = (c: ClueView | null): c is ClueView => !!c
  const clues = [...foundBy.keys()].map((id) => clueOf(id)).filter(nonNull)

  // ───── 조사 보드
  const board: BoardView | null = sc.board
    ? {
        goal: sc.board.goal,
        questions: sc.board.questions.map((q): BoardQuestionView => {
          const shared = q.facts.filter((id) => foundBy.has(id))
          const solved = evalCond(q.solved, ctx)
          const open = !!q.open && evalCond(q.open, ctx)
          const revealed = solved || open || shared.length > 0
          return {
            id: q.id,
            text: revealed ? q.text : null,
            solved,
            current: open && !solved,
            answer: solved ? evalText(q.answer, ctx) : null,
            clues: shared.map(clueOf).filter(nonNull),
          }
        }),
      }
    : null
  // 대상 자료는 이번 판에서 파티 누구라도 그 단서를 알아내면 열린다
  const dossier: DossierView[] = (sc.dossier ?? []).map((d) => {
    if (!d.unlock?.hint || foundBy.has(d.unlock.hint)) return { id: d.id, title: d.title, lines: d.lines }
    return { id: d.id, title: d.title, lines: null, lockNote: '아직 잠겨 있다' }
  })

  // ───── 며칠째 낮/밤: 지나온 장면의 시간대를 따라가며, 밤에서 낮으로 넘어갈 때 하루가 지난다
  let timeOfDay: ScenarioView['timeOfDay'] = null
  if (sc.clock.byDay) {
    // 시계가 하루씩 흐르므로 며칠째인지는 시계에서 나온다 (조명이 어두워지는 날과 화면의 날짜가 어긋나지 않는다)
    timeOfDay = { day: run.time + 1, period: run.period ?? 'day' }
  } else if (sc.nodes.some((n) => n.period)) {
    let day = 1
    let period: 'day' | 'night' = 'day'
    for (const id of run.visited) {
      const p = sc.nodes.find((n) => n.id === id)?.period
      if (!p) continue
      if (period === 'night' && p === 'day') day++
      period = p
    }
    timeOfDay = { day, period }
  }

  const endingNodes = sc.nodes.filter((n) => n.kind === 'ending')
  const clock = sc.clock.labels
  const per = sc.clock.per ?? 1
  /** 시계가 몇 칸 넘어갔는지: 시계 1에서 첫 칸, 이후 `per`마다 한 칸 */
  const clockStep = (time: number) => Math.ceil(time / per)
  return {
    mode: 'scenario',
    scenario: { id: sc.id, code: sc.code, name: sc.name, type: sc.type },
    runNo: g.runNo,
    time: run.time,
    clockLabel: clock[Math.min(clockStep(run.time), clock.length - 1)] ?? '',
    light:
      sc.clock.light && sc.deadline
        ? {
            max: clockStep(sc.deadline.time),
            level: Math.min(clockStep(run.time), clockStep(sc.deadline.time)),
            ...(sc.clock.lightName !== undefined ? { name: sc.clock.lightName } : {}),
          }
        : null,
    meter:
      sc.clock.meter !== undefined && sc.deadline
        ? { name: sc.clock.meter, max: clockStep(sc.deadline.time), level: Math.min(clockStep(run.time), clockStep(sc.deadline.time)) }
        : null,
    timeOfDay,
    phase: run.phase,
    me: {
      id: me.id,
      name: me.name,
      hurt: me.hurt,
      panic: isPanicked(me),
      stats: me.stats,
      items: me.items.map((id) => sc.items.find((i) => i.id === id)).filter((i): i is ItemDef => !!i),
      facts: me.facts.map((id) => sc.facts.find((f) => f.id === id)).filter((f): f is HintDef => !!f),
    },
    players: run.players.map((p) => ({
      id: p.id,
      name: p.name,
      hurt: p.hurt,
      panic: isPanicked(p),
      archetype: p.archetype,
      stats: p.stats,
      progress:
        run.phase === 'personal'
          ? run.personal[p.id]?.done
            ? 'done'
            : run.personal[p.id]?.committed
              ? 'solo'
              : run.personal[p.id]?.pick
                ? 'picked'
                : 'choosing'
          : null,
      acted:
        run.phase === 'vote'
          ? !!run.votes[p.id] || isPanicked(p)
          : run.phase === 'split'
            ? !!run.picks[p.id]
            : run.phase === 'personal'
              ? !!run.personal[p.id]?.done
              : false,
      ready: run.ready.includes(p.id),
    })),
    entity: {
      code: sc.code,
      name: sc.name,
      type: sc.type,
      summary: sc.summary,
      observation: sc.observation,
      manual: sc.manual,
      dossier,
    },
    clues,
    board,
    itemNames: Object.fromEntries(sc.items.map((i) => [i.id, i.name])),
    aftermath: visibleTo(run.aftermath, playerId),
    scene,
    result,
    ending,
    endings: {
      reached: endingNodes
        .filter((n) => (g.endings[n.id] ?? 0) > 0)
        .map((n) => ({
          id: n.id,
          title: n.title ?? n.id,
          tier: n.kind === 'ending' ? n.tier : 'neutral',
          count: g.endings[n.id],
        })),
      total: endingNodes.length,
    },
  }
}
