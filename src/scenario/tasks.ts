// 과제 빌더: "과제 하나씩 풀기" 구조를 평범한 장면들로 풀어 준다. 엔진(game.ts)은 이 구조를 모른다 —
// 그래서 검증기·전수 탐색기·화면이 그대로 동작한다.
//
// 과제 하나의 흐름:
//   소개 → 조사(분할: 각자 한 곳을 살핀다) → 추리(투표: 답을 걸거나 패스) ─ 정답 → 다음 과제(순서는 판마다 무작위)
//                                    └ 오답 / 패스 → 조사로 돌아간다. 이번에는 전에 없던 조사 선택지가 열려 있다.
// 오답은 정신력과 조명(시계)을 깎고 그 답이 지워진다. 패스는 조명만 깎는다. 오답이 지워지므로 언제든 끝이 난다.
//
// 추리 사슬(`TaskDef.chain`): 답을 한 번에 고르는 대신 추리를 이렇게 이어 간다.
//   추리 장면에는 "추리를 시작한다 / 더 조사한다" 둘뿐이다. 시작하면 단계마다 모두가 투표하고(동률은 추첨) 맞으면 근거가 된 단서를
//   이야기로 밝히며 다음 단계로 간다. 중간에 틀리면 그 시도가 거기서 끝나고 오답의 대가와 밤이 이어진다. 마지막 단계까지 맞으면 풀린다.
//   틀린 시도와 패스는 같은 횟수(`pass-<과제>-1·2`)로 세어져 조사 선택지가 3단계까지 열린다.
// 조사 선택지는 3단계로 쌓인다: 처음에는 1단계만, 오답·패스가 한 번이면 2단계까지, 두 번 이상이면 3단계까지 열린다.
// 위험한 곳: `risk`가 있는 조사 중 하나가 판마다 무작위로 "위험한 곳"으로 뽑힌다. 거기를 살핀 사람은 발견은 그대로 얻되 이야기와 대가(`hazard`)를 치른다.
import type { Cond, Effect, Node, PersonalOption, PersonalStep, PrivateFinding, QuestionDef, Route, SoloChoice, Text, VarSpec } from './types.ts'
// (PersonalStep·SoloChoice는 단계형 조사의 단계에도 쓴다)

/**
 * 단계형 조사("파고들기"): 이 조사를 고른 사람은 결과를 얻기 전에 혼자 몇 단계를 더 고른다.
 * 모두가 조사를 고르고 나면 이 조사를 고른 사람만 `steps`를 따라 진행하고(나머지는 기다린다), 모두 끝나면 결과가 한꺼번에 나온다.
 * 단서는 단계의 선택지 효과(`effects`의 `learn`)로 얻으므로, 어떻게 고르느냐에 따라 얻는 것이 달라진다 — 잘 고르면 온전한 단서,
 * 어긋나면 흐릿한 단서나 대가만 얻는다. 판정에 난수는 없다.
 */
export interface ProbeDig {
  /** 첫 단계는 `steps[0]`이다. 단계 id는 과제 안에서 유일해야 한다(다른 조사의 단계와도). 선택지가 없는 단계는 읽고 계속을 누르면 `then`으로 간다. */
  steps: PersonalStep[]
}

export interface TaskProbe {
  /** 조사 선택지 id (과제 안에서 유일) */
  id: string
  text: Text
  /** 몇 단계 조사에서 열리는지 */
  tier: 1 | 2 | 3
  /**
   * 이 곳을 살핀 사람에게 보이는 발견. 판마다 바뀌는 값에 따라 여러 개를 쓸 수 있고, 위에서부터 처음 맞는 것이 적용된다.
   * 마지막은 `when` 없이 둔다 (그래야 어떤 판에서도 한 번 살핀 곳으로 기록된다).
   */
  findings: Omit<PrivateFinding, 'action'>[]
  /** 이 곳을 동시에 살필 수 있는 최대 인원 (기본 1. `min`이 있으면 `min`) */
  max?: number
  /** 이 조사가 보이는 추가 조건. 예: 혼자일 때만 보이는 대체 조사 `{ party: { max: 1 } }` */
  when?: Cond
  /**
   * "둘이 함께 해야 열리는" 조사: 이 곳을 살피는 최소 인원 (2 이상). 모자라면 조사가 진행되지 않고 함께할 사람을 모아야 한다.
   * 혼자(또는 할 수 있는 사람이 `min`명보다 적을 때)는 선택지가 보이지 않으므로, 같은 정보를 혼자 얻는 다른 조사를 따로 둔다.
   */
  min?: number
  /**
   * 이 곳이 이번 판의 "위험한 곳"으로 뽑히면 살핀 사람이 겪는 이야기 (발견 글 뒤에 붙는다). 과제의 `hazard`(대가)도 함께 치른다.
   * 위험한 곳은 판마다 `risk`가 있는 조사 중 하나가 뽑히므로 어디가 위험한지 외워서는 알 수 없다. 과제 안에 둘 이상 있어야 한다.
   */
  risk?: Text
  /** true면 부상자는 이 조사를 할 수 없다 (몸을 쓰는 조사) */
  needsHealthy?: boolean
  /**
   * 스텟 기준선 같은 자격 조건. 이 조사가 열려 있는데(단계·살피지 않음·`when`) 자격이 안 되는 사람에게는 `locked` 문구와 함께 잠긴 채 보인다.
   * 필수 길이 아니라 시간을 아끼는 지름길에 쓴다 (같은 단서를 더 높은 단계 조사가 주므로, 자격이 없어도 과제는 풀린다).
   */
  gate?: { cond: Cond; locked: string }
  /**
   * 있으면 단계형 조사다: `findings`는 조사를 고른 직후 읽는 도입(단서 없이 분위기만)이고, 단서는 `dig`의 단계에서 얻는다.
   * 둘이 함께 하는 조사(`min`)와는 쓸 수 없다.
   */
  dig?: ProbeDig
}

export interface TaskAnswer {
  id: string
  text: Text
  /** 정답이면 `true`, 판마다 다르면 정답인 판의 조건 (예: `{ var: 'lock', is: '2' }`). 오답이면 `false`. */
  right: boolean | Cond
  /** 오답일 때 고른 직후 보이는 이야기 (정답의 이야기는 과제의 `solved`) */
  wrong?: Text
  /** 오답이었음을 모두가 알게 되는 사실 id (조사 보드에 붙는다) */
  wrongFact?: string
}

/** 추리 사슬의 한 단계 */
export interface ChainStep {
  /** 이 단계에서 풀어야 할 질문. 알아낸 단서에 따라 조각을 덧붙일 수 있다 (예: 이미 밝혀진 오답 알림) */
  question: Text
  /** 이 단계의 보기. 맞는 것이 판마다 달라도 된다(`right`가 조건). 틀린 보기는 `wrong`(이야기)이 있어야 한다. 순서는 판마다 섞인다. */
  options: TaskAnswer[]
  /**
   * 맞게 골랐을 때의 이야기: 어떤 단서가 근거였는지 보여 준다. 단서를 아는지(`knows`)에 따라 조각을 나누어,
   * 근거가 있었으면 그 단서를, 없었으면 "감이었다"를 쓴다. 마지막 단계는 비워도 되고, 있으면 과제의 `solved` 앞에 붙는다.
   */
  ok?: Text
}

export interface TaskDef {
  /** 과제 id (장면·깃발 이름에 쓰인다. `>`나 공백이 없어야 한다) */
  id: string
  title: string
  /** 과제를 시작할 때 읽는 이야기 */
  intro: Text
  /** 조사 장면의 글 (기본 문구가 있다) */
  probeText?: Text
  /** 단계형 조사(`TaskProbe.dig`)를 한 사람이 혼자 이어서 살필 때의 장면의 글 (조사를 맡은 사람은 고르는 화면 없이 바로 첫 단계로 가므로 이 글은 기다리는 사람에게만 보인다) */
  digText?: Text
  probes: TaskProbe[]
  /** 아무것도 살피지 않고 기다리는 선택지 (조사 칸이 모자란 인원이 고른다) */
  waitText?: string
  /** 추리 장면의 글: 풀어야 할 의문 */
  question: Text
  /** 한 번에 고르는 답. `chain`이 없을 때 쓴다 (둘 중 하나만) */
  answers?: TaskAnswer[]
  /**
   * 추리 사슬: 3단계 이상. 있으면 추리 장면이 "추리를 시작한다 / 더 조사한다"로 바뀌고 단계마다 투표한다.
   * `answers`와 함께 쓸 수 없다.
   */
  chain?: ChainStep[]
  /** 정답을 골랐을 때(사슬이면 마지막 단계까지 맞았을 때) 이야기 (판마다 다르면 조각에 `when`을 단다) */
  solved: Text
  /** 정답을 골랐을 때 일어나는 일 */
  onSolve?: Effect[]
  /** 패스했을 때 읽는 이야기 */
  passStory?: Text
  /** 오답 대가 (기본: 조명 +1, 모두 정신력 −2) */
  failCost?: Effect[]
  /** 패스 대가 (기본: 조명 +1) */
  passCost?: Effect[]
  /** 위험한 곳(`TaskProbe.risk`)을 살폈을 때 그 사람이 치르는 대가 (대상은 `actor`). `risk`가 있는 조사가 있으면 꼭 필요하다. */
  hazard?: Effect[]
  /** 조사 보드의 의문: 관련 사실들과 풀렸을 때 적힐 답 */
  board: { text: string; facts: string[]; answer: Text }
  /** 이 과제의 장면들이 낮인지 밤인지 (비우면 앞 장면의 시간대를 이어받는다) */
  period?: 'day' | 'night'
  /**
   * 오답이나 패스를 하면 하루가 지나 밤이 온다. 이 밤(개인 행동)에 이 과제만의 선택지(단서·아이템)를 둔다.
   * 시나리오 공통의 밤 선택지(`TasksSpec.nightCommon`, 스텟 올리기·휴식)가 뒤에 함께 나온다. 비워 두면 밤 없이 바로 조사로 돌아간다.
   * 단서를 주는 선택지는 `when: { not: { knows } }`로 이미 알아낸 뒤에는 숨기는 것이 좋다.
   */
  night?: { text?: Text; options: PersonalOption[]; steps?: PersonalStep[] }
}

export interface TasksSpec {
  tasks: TaskDef[]
  /** 모든 과제를 풀면 가는 장면 */
  after: string
  /**
   * 과제 하나가 풀릴 때마다(마지막 과제는 빼고) 거치는 막간의 길. 위에서부터 처음 맞는 것으로 가고, 마지막은 조건 없이 둔다.
   * 막간 장면(사건·밤)의 끝은 `enter`로 이어 주어야 다음 과제로 간다. 없으면 바로 다음 과제로 간다.
   */
  between?: { when?: Cond; to: string }[]
  /** 추리 장면의 "답을 걸지 않고 더 조사한다" 선택지 문구 (기본은 밤이 온다고 알린다) */
  passText?: string
  /** 추리 사슬이 있는 과제의 "추리를 시작한다" 선택지 문구 */
  reasonText?: string
  /** 모든 과제의 밤에 공통으로 나오는 선택지 (스텟 올리기·휴식). 과제를 푼 뒤의 밤도 이것만 쓴다. */
  nightCommon?: PersonalOption[]
  /** 풀이 순서를 뽑는 무작위 값의 이름 (기본 `order`) */
  orderVar?: string
  /**
   * 시나리오의 `clock.byDay`와 짝이다: 시계는 밤에서 낮으로 넘어갈 때 자동으로 흐르므로 오답·패스의 기본 대가에서 시간을 뺀다.
   * 그래서 모든 과제에 오답·패스 뒤의 밤(`night`)이 있어야 한다.
   */
  dayClock?: boolean
}

export interface TasksBuilt {
  /** 시나리오의 `nodes`에 이어 붙인다 */
  nodes: Node[]
  /** 시나리오의 `vars`에 넣는다 (과제 풀이 순서, 과제마다 위험한 곳) */
  vars: VarSpec[]
  /** 첫 과제로 가는 길. 과제를 시작하기 전 이야기 장면의 `next`로 쓴다. */
  enter: Route
  /** 시나리오 보드의 `questions`에 넣는다 (과제 순서대로가 아니라 정의한 순서) */
  questions: QuestionDef[]
}

const DEFAULT_FAIL: Effect[] = [{ time: 1 }, { stat: 'sanity', add: -2, to: 'all' }]
const DEFAULT_PASS: Effect[] = [{ time: 1 }]
/** 시간이 하루 단위로 흐르는 시나리오(`dayClock`)의 기본 대가: 시간은 밤이 지나며 흐른다 */
const DAY_FAIL: Effect[] = [{ stat: 'sanity', add: -2, to: 'all' }]
const DAY_PASS: Effect[] = []

const flag = (id: string): Cond => ({ flag: id })
const permutations = <T>(items: T[]): T[][] =>
  items.length <= 1 ? [items] : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]))

const startedFlag = (t: string) => `started-${t}`
const solvedFlag = (t: string) => `solved-${t}`
const failFlag = (t: string, a: string) => `ng-${t}-${a}`
const passFlag = (t: string, n: 1 | 2) => `pass-${t}-${n}`
const seenFlag = (t: string, p: string) => `seen-${t}-${p}`
/** 과제 `t`에서 이번 판의 위험한 곳을 가리키는 무작위 값의 이름 */
export const riskVar = (t: string) => `risk-${t}`

/** `digTwoStep`의 한 단계: 질문과, 맞는 선택지·어긋난 선택지 */
export interface DigTwoStepPart {
  /** 이 단계의 서술과 질문 */
  text: Text
  /** 맞는 선택지의 문구 */
  good: string
  /** 어긋난 선택지의 문구 */
  bad: string
  /** 어긋난 선택지를 골랐을 때 읽는 글 (거기서 끝나고 단서를 얻지 못한다) */
  badEnd: Text
  /** true면 어긋난 선택지를 먼저 보인다 (맞는 선택지가 늘 첫 번째가 되지 않게, 조사마다 번갈아 쓴다) */
  badFirst?: boolean
}

export interface DigTwoStep {
  /** 첫 단계: 맞는 쪽을 고르면 둘째 단계로 가고, 어긋난 쪽을 고르면 거기서 끝난다 */
  first: DigTwoStepPart
  /** 둘째 단계: 맞게 고르면 단서를 얻고, 어긋나게 고르면 얻지 못한다 */
  second: DigTwoStepPart
  /** 맞게 끝냈을 때 얻는 것. 판마다 다르면 여러 개를 쓰고 `when`으로 가른다 (판마다 하나만 보인다. 맞는 선택지 문구는 같아야 한다) */
  clue: { when?: Cond; result: Text; effects: Effect[]; later?: Effect[] }[]
  /** 어긋났을 때 치르는 대가 (기본: 정신력 −1) */
  cost?: Effect[]
}

/**
 * 두 단계 파고들기를 만든다. 맞게 두 번 고르면 단서를 얻고, 어긋나게 고르면 얻지 못하고 대가를 치른다.
 * 단계 id는 `<id>-1`, `<id>-x`(첫 단계에서 어긋난 끝), `<id>-2`이고 선택지 id는 `<id>-1-good` 같은 꼴이다.
 */
export function digTwoStep(id: string, o: DigTwoStep): ProbeDig {
  const cost: Effect[] = o.cost ?? [{ stat: 'sanity', add: -1, to: 'actor' }]
  const arrange = <T,>(goods: T[], bad: T, badFirst?: boolean): T[] => (badFirst ? [bad, ...goods] : [...goods, bad])
  const goods2: SoloChoice[] = o.clue.map((c, i) => ({
    id: `${id}-2-good-${i}`,
    text: o.second.good,
    ...(c.when ? { when: c.when } : {}),
    result: c.result,
    effects: c.effects,
    ...(c.later ? { later: c.later } : {}),
  }))
  return {
    steps: [
      {
        id: `${id}-1`,
        text: o.first.text,
        choices: arrange<SoloChoice>(
          [{ id: `${id}-1-good`, text: o.first.good, then: `${id}-2` }],
          { id: `${id}-1-bad`, text: o.first.bad, then: `${id}-x` },
          o.first.badFirst,
        ),
      },
      { id: `${id}-x`, text: o.first.badEnd, effects: cost },
      {
        id: `${id}-2`,
        text: o.second.text,
        choices: arrange<SoloChoice>(goods2, { id: `${id}-2-bad`, text: o.second.bad, result: o.second.badEnd, effects: cost }, o.second.badFirst),
      },
    ],
  }
}

const pieces = (text: Text) => (typeof text === 'string' ? [{ text }] : text)

/** 위험한 곳을 살폈을 때의 발견: 원래 발견에 위험의 이야기와 대가를 덧붙인 것이 앞에, 평범한 발견이 뒤에 온다 */
function withRisk(task: TaskDef, probe: TaskProbe): TaskProbe['findings'] {
  if (probe.risk === undefined) return probe.findings
  const hot: Cond = { var: riskVar(task.id), is: probe.id }
  const risky = probe.findings.map((f) => ({
    ...f,
    when: f.when ? ({ all: [hot, f.when] } as Cond) : hot,
    text: [...pieces(f.text), ...pieces(probe.risk as Text)],
    effects: [...(f.effects ?? []), ...(task.hazard ?? [])],
  }))
  return [...risky, ...probe.findings]
}

/** 틀릴 수 있는 답 (정답이 판마다 다른 답도 포함) */
const wrongOf = (task: TaskDef): TaskAnswer[] => (task.answers ?? []).filter((a) => a.right !== true)

/** 이 과제에서 오답·패스로 단계가 오른 횟수가 `k` 이상인 조건 (오답은 답마다 한 번, 패스는 두 번까지 센다) */
function missesAtLeast(task: TaskDef, k: 1 | 2): Cond {
  const flags = [...wrongOf(task).map((a) => failFlag(task.id, a.id)), passFlag(task.id, 1), passFlag(task.id, 2)]
  if (k === 1) return { any: flags.map(flag) }
  const pairs: Cond[] = []
  for (let i = 0; i < flags.length; i++) for (let j = i + 1; j < flags.length; j++) pairs.push({ all: [flag(flags[i]), flag(flags[j])] })
  return { any: pairs }
}

/** 조사 `tier`단계 선택지가 열려 있는 조건 */
const tierOpen = (task: TaskDef, tier: 1 | 2 | 3): Cond | undefined =>
  tier === 1 ? undefined : missesAtLeast(task, tier === 2 ? 1 : 2)

export function buildTasks(spec: TasksSpec): TasksBuilt {
  const orderVar = spec.orderVar ?? 'order'
  const tasks = spec.tasks
  const nodes: Node[] = []

  // 만들기 전에 작성 실수를 잡는다
  const ids = new Set<string>()
  for (const t of tasks) {
    if (/[>\s]/.test(t.id)) throw new Error(`과제 id "${t.id}"에 '>'나 공백을 쓸 수 없다`)
    if (ids.has(t.id)) throw new Error(`과제 id 중복 "${t.id}"`)
    ids.add(t.id)
    for (const tier of [1, 2, 3] as const) {
      if (!t.probes.some((p) => p.tier === tier)) throw new Error(`과제 "${t.id}": ${tier}단계 조사 선택지가 하나도 없다`)
    }
    if (t.chain) {
      if (t.answers?.length) throw new Error(`과제 "${t.id}": 추리 사슬(chain)과 답(answers)을 함께 쓸 수 없다`)
      if (t.chain.length < 3) throw new Error(`과제 "${t.id}": 추리 사슬은 3단계 이상이어야 한다`)
      t.chain.forEach((s, k) => {
        const where = `과제 "${t.id}" 추리 ${k + 1}단계`
        if (s.options.length < 2) throw new Error(`${where}: 보기가 둘 이상이어야 한다`)
        if (new Set(s.options.map((o) => o.id)).size !== s.options.length) throw new Error(`${where}: 보기 id가 겹친다`)
        if (!s.options.some((o) => o.right !== false)) throw new Error(`${where}: 맞는 보기가 없다`)
        if (s.options.some((o) => o.right !== true && !o.wrong)) throw new Error(`${where}: 틀릴 수 있는 보기에 이야기(wrong)가 없다`)
        if (k < t.chain!.length - 1 && !s.ok) throw new Error(`${where}: 맞았을 때 근거를 보이는 이야기(ok)가 없다`)
      })
    } else {
      if (!t.answers?.some((a) => a.right !== false)) throw new Error(`과제 "${t.id}": 정답이 없다`)
      if (wrongOf(t).some((a) => !a.wrong)) throw new Error(`과제 "${t.id}": 틀릴 수 있는 답에 이야기(wrong)가 없다`)
    }
    const risky = t.probes.filter((p) => p.risk !== undefined)
    if (risky.length === 1) throw new Error(`과제 "${t.id}": 위험한 곳(risk)은 둘 이상이어야 판마다 어디가 위험한지 달라진다`)
    if (risky.length > 0 && !t.hazard?.length) throw new Error(`과제 "${t.id}": risk가 있는 조사가 있으면 대가(hazard)도 있어야 한다`)
    if (spec.dayClock && !t.night) throw new Error(`과제 "${t.id}": dayClock이면 오답·패스 뒤의 밤(night)이 있어야 시간이 흐른다`)
    const stepIds = new Set<string>()
    for (const p of t.probes) {
      if (p.dig) {
        if (p.dig.steps.length === 0) throw new Error(`과제 "${t.id}" 조사 "${p.id}": 단계형 조사(dig)에는 단계가 하나 이상 있어야 한다`)
        if (p.min !== undefined) throw new Error(`과제 "${t.id}" 조사 "${p.id}": 둘이 함께 하는 조사(min)는 단계형 조사(dig)로 만들 수 없다`)
        if ((p.max ?? 1) !== 1) throw new Error(`과제 "${t.id}" 조사 "${p.id}": 단계형 조사(dig)는 한 사람만 고를 수 있다 (max 1)`)
        for (const st of p.dig.steps) {
          if (stepIds.has(st.id)) throw new Error(`과제 "${t.id}" 조사 "${p.id}": 단계 id "${st.id}"가 과제 안에서 겹친다`)
          stepIds.add(st.id)
        }
      }
      if (p.min !== undefined && (!Number.isInteger(p.min) || p.min < 2)) throw new Error(`과제 "${t.id}" 조사 "${p.id}": min은 2 이상의 정수여야 한다`)
      if (p.min !== undefined && p.max !== undefined && p.max < p.min) throw new Error(`과제 "${t.id}" 조사 "${p.id}": max가 min보다 작다`)
      if (p.findings.length === 0 || p.findings[p.findings.length - 1].when) {
        throw new Error(`과제 "${t.id}" 조사 "${p.id}": 마지막 발견은 조건 없이 두어야 한다`)
      }
    }
  }

  // ───── 과제 순서: 판마다 무작위
  const orders = permutations(tasks.map((t) => t.id))
  const orderKey = (o: string[]) => o.join('>')
  const vars: VarSpec[] = [
    { id: orderVar, pick: orders.map(orderKey) },
    ...tasks.flatMap((t) => {
      const risky = t.probes.filter((p) => p.risk !== undefined)
      return risky.length > 0 ? [{ id: riskVar(t.id), pick: risky.map((p) => p.id) }] : []
    }),
  ]
  const allSolved: Cond = { all: tasks.map((t) => flag(solvedFlag(t.id))) }
  const intro = (t: string) => `${t}-intro`
  const enter: Route = [
    { when: allSolved, to: spec.after },
    ...orders.flatMap((o) =>
      o.map((t, i) => ({
        when: {
          all: [{ var: orderVar, is: orderKey(o) }, ...o.slice(0, i).map((x) => flag(solvedFlag(x))), { not: flag(solvedFlag(t)) }],
        } as Cond,
        to: intro(t),
      })),
    ),
    // 위에서 걸리지 않는 경우는 없지만, 길의 마지막은 조건 없이 두어야 한다
    { to: spec.after },
  ]

  for (const task of tasks) {
    const t = task.id
    const firstNode = nodes.length
    const probe = `${t}-probe`
    const dig = `${t}-dig`
    const dug = task.probes.filter((p) => p.dig)
    const think = `${t}-think`
    // 오답·패스 뒤에는 하루가 저문다: 이 과제만의 밤이 있으면 거기를 거쳐 조사로 돌아간다
    const afterMiss = task.night ? `${t}-night` : probe
    const fail = task.failCost ?? (spec.dayClock ? DAY_FAIL : DEFAULT_FAIL)
    const pass = task.passCost ?? (spec.dayClock ? DAY_PASS : DEFAULT_PASS)

    // 오답·패스 뒤에 읽는 이야기에 붙는 안내: 새로 열린 조사가 있는지
    const unlocked: { text: string; when: Cond }[] = [
      { text: '\n새로 살필 수 있는 곳이 생겼다.', when: { all: [missesAtLeast(task, 1), { not: missesAtLeast(task, 2) }] } },
      { text: '\n이제 살필 수 있는 곳은 전부 열렸다.', when: missesAtLeast(task, 2) },
    ]
    const plus = (text: Text): Text => [...(typeof text === 'string' ? [{ text }] : text), ...unlocked]

    // 소개
    nodes.push({ id: intro(t), kind: 'story', title: task.title, text: task.intro, onEnter: [{ flag: startedFlag(t) }], next: probe })

    // 조사: 각자 한 곳을 살핀다. 1단계는 처음부터, 2단계는 오답·패스가 한 번이면, 3단계는 두 번 이상이면 열린다. 살핀 곳은 다시 살필 수 없다.
    nodes.push({
      id: probe,
      kind: 'split',
      title: `${task.title} · 조사`,
      // 조사는 각자 자기 몫을 살피는 장면이라 "모두의 조합이 결과를 정한다"는 설명이 맞지 않는다
      label: '조사',
      hint: '각자 다른 곳을 하나씩 살핀다 (한 곳은 한 명만)',
      text: task.probeText ?? '어디를 살필지 정한다. 한 번에 한 곳씩만 살필 수 있고, 살핀 곳은 다시 살필 수 없다.',
      actions: [
        ...task.probes.map((p) => {
          const open = tierOpen(task, p.tier)
          const notSeen: Cond = { not: flag(seenFlag(t, p.id)) }
          const conds = [...(open ? [open] : []), notSeen, ...(p.when ? [p.when] : [])]
          return {
            id: p.id,
            text: p.text,
            max: p.max ?? p.min ?? 1,
            ...(p.min !== undefined ? { min: p.min } : {}),
            // `locked`는 두지 않는다: 두면 아직 안 열린 단계의 조사가 처음부터 잠긴 채 보인다 (부상 문구는 엔진의 기본값을 쓴다)
            ...(p.needsHealthy ? { needsHealthy: true } : {}),
            ...(p.gate ? { gate: p.gate } : {}),
            when: conds.length === 1 ? conds[0] : ({ all: conds } as Cond),
          }
        }),
        { id: `${t}-wait`, text: task.waitText ?? '살피지 않고 다른 사람이 하는 일을 지켜본다', calming: true },
      ],
      private: task.probes.flatMap((p) =>
        withRisk(task, p).map((f): PrivateFinding => ({ ...f, action: p.id, effects: [...(f.effects ?? []), { flag: seenFlag(t, p.id) }] })),
      ),
      // 단계형 조사를 고른 사람이 있으면 먼저 파고들기로 간다 (그 사람만 혼자 단계를 진행하고, 끝나면 추리로 간다).
      // 조사 결과는 파고들기가 끝날 때까지 미뤄서 파고들기의 결과와 한 번에 보인다 (결과 화면이 두 번 나오지 않게).
      ...(dug.length > 0 ? { holdResult: true } : {}),
      outcomes: dug.length > 0 ? [{ when: { any: dug.map((p): Cond => ({ picked: p.id })) }, next: dig }, { next: think }] : [{ next: think }],
    })

    // 파고들기: 단계형 조사를 고른 사람만 혼자 이어서 고른다. 모두 끝나야 결과가 나오고, 조사하지 않은 사람은 조용히 기다린다.
    if (dug.length > 0) {
      nodes.push({
        id: dig,
        kind: 'personal',
        title: `${task.title} · 조사`,
        text: task.digText ?? '조사를 맡은 사람이 이어서 살피는 중이다. 끝나면 모두의 조사 결과가 나온다.',
        quiet: true,
        options: dug.map((p): PersonalOption => ({ id: `dig-${p.id}`, text: p.text, when: { did: p.id }, auto: true, then: p.dig!.steps[0].id })),
        steps: dug.flatMap((p) => p.dig!.steps),
        next: think,
      })
    }

    // 추리: 답을 걸거나 패스한다. 사슬이 있으면 "추리를 시작한다"와 "더 조사한다"뿐이다.
    const passChoice = {
      id: `${t}-pass`,
      text: spec.passText ?? '확신이 없다 — 답을 걸지 않고 더 조사한다 (밤이 온다)',
      next: [{ when: { not: flag(passFlag(t, 1)) }, to: `${t}-pass-1` }, { to: `${t}-pass-2` }] as Route,
    }
    const chain = task.chain
    nodes.push({
      id: think,
      kind: 'vote',
      title: `${task.title} · 추리`,
      text: task.question,
      choices: chain
        ? [
            {
              id: `${t}-reason`,
              text: spec.reasonText ?? '추리를 시작한다 (틀리면 대가를 치른다)',
              next: `${t}-c1`,
            },
            passChoice,
          ]
        : [
            ...(task.answers ?? []).map((a) => ({
              id: a.id,
              text: a.text,
              when: a.right === true ? undefined : ({ not: flag(failFlag(t, a.id)) } as Cond),
              next: a.right === true ? `${t}-right` : a.right === false ? `${t}-wrong-${a.id}` : [{ when: a.right, to: `${t}-right` }, { to: `${t}-wrong-${a.id}` }],
            })),
            passChoice,
          ],
    })

    // 추리 사슬: 단계마다 투표 → 맞으면 근거를 밝히는 이야기 → 다음 단계. 틀리면 그 시도가 끝나고 대가를 치른 뒤 밤이 온다.
    // 틀린 시도는 패스와 같은 횟수(`pass-<과제>-1·2`)로 센다: 첫 번째와 두 번째 이후가 다른 장면이다.
    if (chain) {
      const last = chain.length
      chain.forEach((step, k) => {
        const i = k + 1
        const after = i === last ? `${t}-right` : `${t}-c${i}-ok`
        nodes.push({
          id: `${t}-c${i}`,
          kind: 'vote',
          title: `${task.title} · 추리 ${i}/${last}`,
          text: step.question,
          shuffle: true, // 맞는 보기가 늘 같은 자리에 있지 않게 판마다 순서를 섞는다
          choices: step.options.map((o) => {
            const miss: { when?: Cond; to: string }[] = [
              { when: { not: flag(passFlag(t, 1)) }, to: `${t}-c${i}-wrong-${o.id}-1` },
              { to: `${t}-c${i}-wrong-${o.id}-2` },
            ]
            return {
              id: o.id,
              text: o.text,
              next: o.right === true ? after : o.right === false ? miss : [{ when: o.right, to: after }, ...miss],
            }
          }),
        })
        for (const o of step.options) {
          if (o.right === true) continue
          for (const n of [1, 2] as const) {
            nodes.push({
              id: `${t}-c${i}-wrong-${o.id}-${n}`,
              kind: 'story',
              title: '아니었다',
              text: plus(o.wrong ?? ''),
              onEnter: [{ flag: passFlag(t, n) }, ...(o.wrongFact ? [{ learn: o.wrongFact, to: 'all' as const }] : []), ...fail],
              next: afterMiss,
            })
          }
        }
        if (i < last) {
          nodes.push({ id: `${t}-c${i}-ok`, kind: 'story', title: `${task.title} · 근거`, tone: 'success', text: step.ok ?? '', next: `${t}-c${i + 1}` })
        }
      })
    }

    // 정답 (사슬이면 마지막 단계의 근거 이야기가 풀이 앞에 붙는다)
    const lastOk = chain?.[chain.length - 1].ok
    nodes.push({
      id: `${t}-right`,
      kind: 'story',
      title: `${task.title} · 풀렸다`,
      tone: 'success',
      // 근거와 풀이 사이의 줄바꿈은 풀이 조각의 앞에 붙인다 (줄바꿈만 있는 조각은 검증기가 "빈 문장"으로 본다)
      text: lastOk ? [...pieces(lastOk), ...pieces(task.solved).map((p) => ({ ...p, text: `\n${p.text}` }))] : task.solved,
      // 풀린 과제의 조사·오답·패스 깃발은 더 읽히지 않으므로 지운다 (남겨 두면 전수 탐색의 상태 수가 과제마다 곱해진다)
      onEnter: [
        { flag: solvedFlag(t) },
        ...task.probes.map((p): Effect => ({ flag: seenFlag(t, p.id), off: true })),
        ...wrongOf(task).map((a): Effect => ({ flag: failFlag(t, a.id), off: true })),
        { flag: passFlag(t, 1), off: true },
        { flag: passFlag(t, 2), off: true },
        ...(task.onSolve ?? []),
      ],
      next: spec.between ? [{ when: allSolved, to: spec.after }, ...spec.between] : enter,
    })

    // 오답: 그 답이 지워지고 대가를 치른 뒤 다시 조사한다
    for (const a of wrongOf(task)) {
      nodes.push({
        id: `${t}-wrong-${a.id}`,
        kind: 'story',
        title: '아니었다',
        text: plus(a.wrong ?? ''),
        onEnter: [{ flag: failFlag(t, a.id) }, ...(a.wrongFact ? [{ learn: a.wrongFact, to: 'all' as const }] : []), ...fail],
        next: afterMiss,
      })
    }

    // 패스: 조명만 깎인다. 두 번째 이후의 패스는 단계가 더 오르지 않고 조명만 깎는다.
    for (const n of [1, 2] as const) {
      nodes.push({
        id: `${t}-pass-${n}`,
        kind: 'story',
        title: '더 조사한다',
        text: plus(task.passStory ?? '아직 확신이 없다. 답을 걸지 않고 다시 둘러보기로 했다. 그러는 사이 하루가 저물었다.'),
        onEnter: [{ flag: passFlag(t, n) }, ...pass],
        next: afterMiss,
      })
    }

    // 밤 장면 (오답·패스 뒤): 이 과제의 선택지 + 공통 선택지
    if (task.night) {
      nodes.push({
        id: `${t}-night`,
        kind: 'personal',
        period: 'night',
        title: `${task.title} · 밤`,
        text: task.night.text ?? '하루가 저물었다. 각자 흩어져 각자의 일을 한다.',
        options: [...task.night.options, ...(spec.nightCommon ?? [])],
        ...(task.night.steps ? { steps: task.night.steps } : {}),
        next: probe,
      })
    }

    if (task.period) for (const node of nodes.slice(firstNode)) node.period ??= task.period
  }

  const questions: QuestionDef[] = tasks.map((task) => ({
    id: task.id,
    text: task.board.text,
    facts: task.board.facts,
    solved: flag(solvedFlag(task.id)),
    open: flag(startedFlag(task.id)), // 과제를 시작하면 의문이 보이고 "지금 과제"로 강조된다
    answer: task.board.answer,
  }))

  return { nodes, vars, enter, questions }
}
