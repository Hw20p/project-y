// 엔진 시험용: 과제 빌더(tasks.ts)로 만든 "과제 하나씩 풀기". 과제를 판마다 다른 순서로 푼다.
// 각 과제는 후보 셋 중 하나가 정답이고, 조사 1단계는 후보 하나를 지워 주고, 2단계는 다른 후보를 지워 주고, 3단계는 답을 알려 준다. 게임에는 들어가지 않는다.
// `tasksDemo`는 과제 셋(자물쇠·램프·문, 순서 6가지)이고 규칙 시험용이다. `tasksSmall`은 과제 둘에 조사 선택지를 단계마다 하나로 줄인 것으로,
// 상태 수가 작아서 전수 탐색기가 끝까지 본다. 탐색기에서 고르는 것은 이쪽이고, 자물쇠의 1단계에 "둘이서 함께 살핀다"(2인 선택지)가 있다.
import { buildTasks, type TaskDef, type TaskProbe } from '../tasks.ts'
import type { Cond, Scenario } from '../types.ts'

const VALUES = ['1', '2', '3']
const other = (v: string, step: number) => VALUES[(VALUES.indexOf(v) + step) % VALUES.length]

/** 정답이 v일 때, 정답에서 `step`칸 뒤의 후보가 아니라는 발견 (마지막 조각은 조건 없이 둔다) */
function eliminate(task: string, varId: string, step: number, what: string): TaskProbe['findings'] {
  return VALUES.map((v, i) => ({
    ...(i < VALUES.length - 1 ? { when: { var: varId, is: v } as Cond } : {}),
    text: `${what}: ${other(v, step)}번은 아니다.`,
    effects: [{ learn: `no-${task}-${other(v, step)}`, to: 'actor' as const }],
  }))
}

function makeTask(id: string, title: string, slim: boolean, pair: boolean): TaskDef {
  const probes: TaskProbe[] = [
    { id: 'look', text: `${title}을 눈으로 살핀다`, tier: 1, findings: eliminate(id, id, 1, '눈으로 보니') },
    // 둘이 함께 해야 열리는 조사 (2인 선택지): 혼자일 때는 보이지 않는다
    ...(pair ? [{ id: 'pair', text: `${title}을 둘이서 함께 살핀다`, tier: 1 as const, min: 2, findings: eliminate(id, id, 2, '둘이서 함께 살피니') }] : []),
    ...(slim ? [] : [{ id: 'touch', text: `${title}을 만져 본다`, tier: 1 as const, findings: eliminate(id, id, 2, '만져 보니') }]),
    { id: 'listen', text: `${title}에 귀를 대 본다`, tier: 2, findings: eliminate(id, id, 1, '소리를 들으니') },
    {
      id: 'note',
      text: `${title} 아래의 쪽지를 읽는다`,
      tier: 3,
      findings: VALUES.map((v, i) => ({
        ...(i < VALUES.length - 1 ? { when: { var: id, is: v } as Cond } : {}),
        text: `쪽지에는 ${v}번이라고 적혀 있다.`,
        effects: [{ learn: `known-${id}`, to: 'actor' as const }],
      })),
    },
  ]
  return {
    id,
    title,
    intro: `${title} 앞에 섰다. 번호를 맞춰야 열린다.`,
    probes,
    question: `${title}의 번호는 무엇인가?`,
    answers: VALUES.map((v) => ({
      id: `n${v}`,
      text: `${v}번이다`,
      right: { var: id, is: v } as Cond,
      wrong: `${v}번을 눌렀지만 열리지 않았다. 불빛이 한 번 흔들렸다.`,
      wrongFact: `no-${id}-${v}`,
    })),
    solved: `딸깍. ${title}이 열렸다.`,
    board: {
      text: `${title}의 번호는?`,
      facts: [...VALUES.map((v) => `no-${id}-${v}`), `known-${id}`],
      answer: VALUES.map((v) => ({ text: `${v}번이다.`, when: { var: id, is: v } as Cond })),
    },
  }
}

const TITLES: Record<string, string> = { lock: '자물쇠', lamp: '램프', door: '문' }

/** `pair`: 첫 과제(자물쇠)에 2인 선택지를 둔다 */
function makeScenario(id: string, code: string, name: string, taskIds: string[], slim: boolean, pair: boolean): Scenario {
  const defs = taskIds.map((t) => makeTask(t, TITLES[t], slim, pair && t === 'lock'))
  const built = buildTasks({ tasks: defs, after: 'finale' })
  return {
    id,
    code,
    name,
    type: 'place',
    party: { min: 1, max: 8 },
    blurb: '과제를 하나씩 푸는 시험용 방.',
    summary: '조명이 켜져 있는 작은 방. 번호를 맞춰야 열리는 것이 있다.',
    observation: ['자물쇠, 램프, 문이 있다.'],
    manual: ['조명이 꺼지기 전에 모두 열어야 한다.'],
    items: [],
    facts: defs.flatMap((t) => [
      ...VALUES.map((v) => ({ id: `no-${t.id}-${v}`, text: `${t.title}의 번호는 ${v}번이 아니다.`, run: true })),
      { id: `known-${t.id}`, text: `${t.title}의 번호를 알아냈다.`, run: true },
    ]),
    board: {
      goal: '조명이 꺼지기 전에 번호를 맞춰 모두 연다.',
      questions: built.questions,
    },
    vars: [built.vars, ...defs.map((t) => ({ id: t.id, pick: [...VALUES] }))],
    clock: { labels: ['조명이 환하다', '조명이 깜빡인다', '조명이 흐려진다', '조명이 어둡다', '조명이 거의 꺼졌다', '조명이 위태롭다', '조명이 꺼졌다'], light: true },
    deadline: { time: 6, node: 'dark' },
    onAllPanic: 'collapse',
    start: 'begin',
    nodes: [
      { id: 'begin', kind: 'story', title: '작은 방', text: '조명이 켜진 작은 방. 번호를 맞춰야 열리는 것이 있다.', next: built.enter },
      ...built.nodes,
      {
        id: 'finale',
        kind: 'vote',
        title: '마지막 선택',
        text: '모두 열렸다. 이제 문 밖으로 나갈 수 있다.',
        choices: [
          { id: 'open', text: '문을 열고 나간다', next: 'win' },
          { id: 'stay', text: '조금 더 머문다', next: 'quiet' },
        ],
      },
      { id: 'win', kind: 'ending', tier: 'true', title: '밖으로', text: '문 밖은 환했다.' },
      { id: 'quiet', kind: 'ending', tier: 'neutral', title: '조용한 방', text: '아무 일도 없이 시간이 흘렀다.' },
      { id: 'dark', kind: 'ending', tier: 'bad', title: '암전', text: '조명이 꺼졌다.' },
      { id: 'collapse', kind: 'ending', tier: 'bad', title: '정신 상실', text: '모두 정신을 잃고 쓰러졌다.' },
    ],
  }
}

export const tasksDemo = makeScenario('tasks', 'T-03', '시험용 과제', ['lock', 'lamp', 'door'], false, false)
export const tasksSmall = makeScenario('tasks-small', 'T-04', '시험용 과제(작은 것)', ['lock', 'door'], true, true)
