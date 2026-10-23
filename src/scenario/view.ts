// 플레이어 한 명에게 보여 줄 시나리오 화면 상태. 서버는 `ScenarioGame` 전체가 아니라 이것만 각 클라이언트에 보낸다.
// 다른 사람의 단서·비공개 발견은 여기서 걸러진다.
import { actionState, currentNode, findStep, openVoteChoices, personalOptionState, soloChoiceState } from './game.ts'
import { evalCond, evalText } from './logic.ts'
import type { Change, PrivateResult, RunPhase, ScenarioGame, ScenarioResult } from './state.ts'
import { isPanicked, type Stats } from './stats.ts'
import type { EndingTier, HintDef, ItemDef, Scenario } from './types.ts'

export interface DossierView {
  id: string
  title: string
  /** 잠겨 있으면 null */
  lines: string[] | null
  /** 잠겨 있을 때 어떻게 열리는지 알려 주는 짧은 안내 */
  lockNote?: string
}

/** 조사 보드의 의문 하나 (내 화면 기준) */
export interface BoardQuestionView {
  id: string
  /** 아직 아무도 관련 단서를 모르면 null (의문이 있다는 것도 모른다) */
  text: string | null
  solved: boolean
  /** 풀렸을 때만 */
  answer: string | null
  /** 내가 아는 관련 단서. `old`는 지난 판에서 알아낸 것(단서 노트)이다. */
  clues: { id: string; text: string; old: boolean }[]
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
  choices: SceneChoiceView[]
  /** 투표가 모두 모였는데 동률이라 진행하지 못하고 있다 */
  tie: boolean
  /** 내가 지금 고른 선택지·행동 */
  myChoiceId: string | null
  /** 개인 장면: 내가 혼자 진행 중인 단계 (아직 고르기 전이거나 끝났으면 null) */
  solo: SoloView | null
  /** 개인 장면: 내 개인 행동이 끝났는지 */
  mineDone: boolean
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
  phase: RunPhase
  me: { id: string; name: string; hurt: boolean; panic: boolean; stats: Stats; items: ItemDef[]; facts: HintDef[] }
  players: PlayerView[]
  /** 며칠째 낮/밤인지 (시나리오가 장면에 시간대를 정해 둔 경우에만) */
  timeOfDay: { day: number; period: 'day' | 'night' } | null
  /** 정보 패널(대상 정보)용. 대상 자료는 내 단서 노트에 따라 열린다. */
  entity: EntityView
  /** 단서 노트: 지금까지 알아낸 사실 (지난 판 것까지) */
  notebook: HintDef[]
  /** 조사 보드 (시나리오에 있을 때만) */
  board: BoardView | null
  /** 아이템 id → 이름 (변화 칩에 "○○ 획득"을 쓰기 위함) */
  itemNames: Record<string, string>
  /** 이 장면에 들어오며 적용된 변화: 지난 선택의 **여파**(`later`)와 이 장면의 진입 효과. 아이템·단서는 본인 것만 보인다. */
  aftermath: Change[]
  scene: SceneView | null
  result: ResultView | null
  ending: EndingView | null
  /** 닿아 본 엔딩. 총 몇 개인지는 알려 주지만 아직 안 닿은 엔딩의 내용은 숨긴다. */
  endings: { reached: { id: string; title: string; tier: EndingTier; count: number }[]; total: number }
}

const BASE_SCENE = { choices: [], tie: false, myChoiceId: null, solo: null, mineDone: false, myLines: [] } satisfies Partial<SceneView>

/** 변화 중 이 사람에게 보여 줄 것: 아이템·단서는 본인 것만, 나머지(스텟·부상·시간)는 모두에게 */
function visibleTo(changes: Change[], playerId: string): Change[] {
  return changes.filter((c) => (c.kind !== 'item' && c.kind !== 'fact') || c.playerId === playerId)
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
    scene = { ...BASE_SCENE, kind: 'story', title: node.title, text: evalText(node.text, ctx) }
  } else if (node.kind === 'vote' && run.phase === 'vote') {
    const open = openVoteChoices(g, node)
    const openIds = new Set(open.map((c) => c.id))
    const counts = open.map((c) => run.players.filter((p) => run.votes[p.id] === c.id).length)
    const top = Math.max(0, ...counts)
    const allVoted = run.players.every((p) => run.votes[p.id])
    scene = {
      ...BASE_SCENE,
      kind: 'vote',
      title: node.title,
      text: evalText(node.text, ctx),
      choices: node.choices.flatMap((c): SceneChoiceView[] => {
        const pickerIds = run.players.filter((p) => run.votes[p.id] === c.id).map((p) => p.id)
        if (openIds.has(c.id)) return [{ id: c.id, text: evalText(c.text, ctx), pickerIds, full: false }]
        return c.locked ? [{ id: c.id, text: evalText(c.text, ctx), locked: c.locked, pickerIds: [], full: false }] : []
      }),
      tie: allVoted && top > 0 && counts.filter((n) => n === top).length > 1,
      myChoiceId: run.votes[playerId] ?? null,
    }
  } else if (node.kind === 'split' && run.phase === 'split') {
    scene = {
      ...BASE_SCENE,
      kind: 'split',
      title: node.title,
      text: evalText(node.text, ctx),
      choices: node.actions.flatMap((a): SceneChoiceView[] => {
        const st = actionState(g, a, playerId)
        const pickerIds = run.players.filter((p) => run.picks[p.id] === a.id).map((p) => p.id)
        const full = a.max !== undefined && pickerIds.length >= a.max
        if (st.open) return [{ id: a.id, text: evalText(a.text, ctx), pickerIds, full }]
        // 내가 지금 이 행동을 하고 있다면(정원이 찬 경우 포함) 잠긴 것이 아니라 내 선택이다
        if (run.picks[playerId] === a.id) return [{ id: a.id, text: evalText(a.text, ctx), pickerIds, full }]
        return st.reason ? [{ id: a.id, text: evalText(a.text, ctx), locked: st.reason, pickerIds, full }] : []
      }),
      tie: false,
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
        const view = { id: o.id, text: evalText(o.text, ctx), pickerIds, full: false }
        if (st.open || picked === o.id) return [view]
        return st.reason ? [{ ...view, locked: st.reason }] : []
      }),
      myChoiceId: picked,
      mineDone: !!prog?.done,
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
    // 부상·치료·스텟은 파티원 줄에 보이는 사실이라 누가 겪었든 모두에게 보인다. 아이템·단서는 본인만 안다.
    const visible = (c: Change) => c.kind === 'hurt' || c.kind === 'heal' || c.kind === 'stat'
    const mine = priv[playerId]
    result = {
      ...rest,
      mine: mine ? { text: mine.text, changes: mine.changes.filter((c) => !visible(c)) } : null,
      changes: [
        ...changes.filter((c) => c.kind !== 'fact' || c.playerId === playerId),
        ...Object.values(priv).flatMap((p) => p.changes.filter(visible)),
      ],
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

  // ───── 단서 노트와 대상 자료
  const book = g.notebooks[playerId] ?? []
  // 판마다 바뀌는 값에 대한 사실(`run`)은 판이 바뀌면 뜻이 없어지므로 단서 노트에서 뺀다
  const notebook = book
    .map((id) => sc.facts.find((f) => f.id === id))
    .filter((f): f is HintDef => !!f && !f.run)

  // ───── 조사 보드
  const board: BoardView | null = sc.board
    ? {
        goal: sc.board.goal,
        questions: sc.board.questions.map((q): BoardQuestionView => {
          const mine = me.facts.filter((id) => q.facts.includes(id))
          const old = book.filter((id) => q.facts.includes(id) && !mine.includes(id) && !sc.facts.find((f) => f.id === id)?.run)
          const solved = evalCond(q.solved, ctx)
          const partyKnows = run.players.some((p) => p.facts.some((id) => q.facts.includes(id)))
          const revealed = solved || partyKnows || old.length > 0
          const clueOf = (id: string, isOld: boolean) => {
            const f = sc.facts.find((x) => x.id === id)
            return f ? { id, text: f.text, old: isOld } : null
          }
          return {
            id: q.id,
            text: revealed ? q.text : null,
            solved,
            answer: solved ? evalText(q.answer, ctx) : null,
            clues: [...mine.map((id) => clueOf(id, false)), ...old.map((id) => clueOf(id, true))].filter(
              (c): c is { id: string; text: string; old: boolean } => !!c,
            ),
          }
        }),
      }
    : null
  const dossier: DossierView[] = (sc.dossier ?? []).map((d) => {
    if (!d.unlock?.hint || book.includes(d.unlock.hint)) return { id: d.id, title: d.title, lines: d.lines }
    return { id: d.id, title: d.title, lines: null, lockNote: '관련된 단서를 찾으면 읽을 수 있다' }
  })

  // ───── 며칠째 낮/밤: 지나온 장면의 시간대를 따라가며, 밤에서 낮으로 넘어갈 때 하루가 지난다
  let timeOfDay: ScenarioView['timeOfDay'] = null
  if (sc.nodes.some((n) => n.period)) {
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
  return {
    mode: 'scenario',
    scenario: { id: sc.id, code: sc.code, name: sc.name, type: sc.type },
    runNo: g.runNo,
    time: run.time,
    clockLabel: clock[Math.min(run.time, clock.length - 1)] ?? '',
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
    notebook,
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
