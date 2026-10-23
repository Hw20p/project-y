// A-03 거래하는 자판기 — 혼자서도, 여럿이서도 할 수 있는 대상 (정원 1~8명).
//
// 진실: 지하 2층 휴게실의 자판기는 "거래"한다. 오늘 밤 받는 것은 정해져 있고(품목), 눌러야 할 칸도 정해져 있다(버튼).
// 거스름돈은 받는 순간 빚이 되고, 도로 넣으면 거래가 처음부터 다시 시작된다. 그래서 거스름돈은 그대로 두고 떠나야 한다.
// 올바른 거래: ① 오늘 받는 품목을 넣고 ② 오늘의 버튼을 누르고 ③ 거스름돈에 손대지 않는다.
// 정전으로 잠긴 문은 이 거래가 끝나야 열린다. 동이 트면 자판기는 장부를 정산하고, 정산되지 않은 것은 가져간다.
//
// 판마다 바뀌는 값: price(받는 품목 coin·photo·badge), button(눌러야 할 칸 A·B·C).
// 단서는 하나씩 후보를 지워 줄 뿐이라 무엇을 살필지 골라야 하고, 모자란 만큼은 답을 걸어(생각 정리) 확인한다 — 틀리면 마음이 크게 흔들린다.
// 조사 칸(라운드 × 인원)이 장소 수보다 적어야 선택이 의미가 있으므로 라운드 수는 인원에 따라 줄어든다: 1명 4번 · 2명 3번 · 3~4명 2번 · 5명 이상 1번.
// 글은 '나'나 '당신'을 쓰지 않아 혼자일 때도 여럿일 때도 자연스럽다.
import type { Cond, Node, PrivateFinding, Route, Scenario } from '../../scenario/types.ts'

/** 주머니 속 세 가지 (오늘 밤 자판기가 받는 것은 이 중 하나) */
const ITEMS = [
  ['coin', '낡은 동전'],
  ['photo', '가족사진'],
  ['badge', '사원증'],
] as const
const BUTTONS = [
  ['A', '왼쪽'],
  ['B', '가운데'],
  ['C', '오른쪽'],
] as const
type ItemId = (typeof ITEMS)[number][0]
type ButtonId = (typeof BUTTONS)[number][0]


/** 후보가 셋인 질문에서 단서 하나는 "후보 하나가 아니다"를 알려 준다. 두 단서를 모으면 하나로 좁혀진다. */
const nextOf = <T extends string>(order: readonly T[], answer: T, step: 1 | 2): T => order[(order.indexOf(answer) + step) % order.length]
const ITEM_ORDER: ItemId[] = ['coin', 'photo', 'badge']
const BUTTON_ORDER: ButtonId[] = ['A', 'B', 'C']

const insight3: Cond = { stat: 'insight', min: 3, by: 'actor' }

// ───────────────────────── 조사 장소는 판마다 한 번만 ─────────────────────────

const SEEN_ACTIONS = ['slot', 'tray', 'dust', 'ear', 'graffiti', 'receipt', 'study']
const seenGate = (id: string) => ({ when: { not: { flag: `seen-${id}` } } as Cond, locked: '이미 살펴본 곳이다' })
const withSeen = (entries: PrivateFinding[]): PrivateFinding[] =>
  entries.map((e) => (SEEN_ACTIONS.includes(e.action) ? { ...e, effects: [...(e.effects ?? []), { flag: `seen-${e.action}` }] } : e))

// ───────────────────────── 조사 보드와 생각 정리 ─────────────────────────

const ITEM_FACTS = ['machine-sums', ...ITEMS.map(([id]) => `no-item-${id}`)]
const BUTTON_FACTS = BUTTONS.map(([id]) => `no-btn-${id}`)
const CHANGE_FACTS = ['change-debt', 'change-restart']
const QUESTIONS = [
  { id: 'item', facts: ITEM_FACTS },
  { id: 'button', facts: BUTTON_FACTS },
  { id: 'change', facts: CHANGE_FACTS },
] as const

const known = (ids: readonly string[]): Cond => ({ any: ids.map((knows): Cond => ({ knows })) })
const askable = (q: (typeof QUESTIONS)[number]): Cond => ({ all: [{ not: { flag: `solved-${q.id}` } }, known(q.facts)] })

/** 조사 라운드가 다 끝났는지: 1명은 4번, 2명 3번, 3~4명 2번, 5명 이상은 1번 (조사할 곳은 일곱 곳이라 칸이 장소보다 많아지지 않게) */
const ROUNDS_DONE: Cond = {
  any: [
    { all: [{ party: { max: 1 } }, { time: { min: 4 } }] },
    { all: [{ party: { min: 2, max: 2 } }, { time: { min: 3 } }] },
    { all: [{ party: { min: 3, max: 4 } }, { time: { min: 2 } }] },
    { all: [{ party: { min: 5 } }, { time: { min: 1 } }] },
  ],
}
/** 목소리 사건은 두 번째 라운드 뒤에 오지만, 라운드가 하나뿐인 큰 파티는 소리 사건 바로 뒤에 온다 */
const VOICE_DUE: Cond = {
  all: [{ not: { flag: 'voice' } }, { any: [{ time: { min: 2 } }, { party: { min: 5 } }] }],
}
/** 한 바퀴 뒤: 다 돌았으면 마지막 결정, 아니면 다음 조사 */
const NEXT_ROUND: Route = [{ when: ROUNDS_DONE, to: 'gather' }, { to: 'patrol' }]
const AFTER: Route = [
  { when: { all: [{ time: { min: 1 } }, { not: { flag: 'hum' } }] }, to: 'event-hum' },
  { when: VOICE_DUE, to: 'event-voice' },
  ...NEXT_ROUND,
]
/** 소리 사건 뒤: 목소리가 올 차례면 목소리, 아니면 다음 */
const AFTER_HUM: Route = [{ when: VOICE_DUE, to: 'event-voice' }, ...NEXT_ROUND]
/** 조사 한 바퀴가 끝나면 생각을 정리한다. 걸어 볼 의문이 없으면 건너뛴다. */
const TO_THINK: Route = [{ when: { any: QUESTIONS.map(askable) }, to: 'think' }, ...AFTER]

/** 틀린 답: 그 답이 지워지고 아닌 것이 단서로 붙으며 마음이 크게 흔들린다 */
const wrongGuess = (flag: string, learn?: string) =>
  [{ flag }, ...(learn ? [{ learn, to: 'all' as const }] : []), { stat: 'sanity' as const, add: -2, to: 'all' as const }]

const THINK_NODES: Node[] = [
  {
    id: 'think',
    kind: 'vote',
    title: '생각 정리',
    text: '한 바퀴를 돌고 나니 머릿속이 어지럽다. 아는 것을 하나씩 늘어놓고, 확신이 서는 의문이 있으면 그 답을 걸어 본다.\n건 답은 그 자리에서 시험해 보게 되고, 틀리면 마음이 크게 흔들린다. 확신이 없으면 걸지 않아도 된다.',
    choices: [
      // 받는 것
      ...ITEMS.map(([id, label]) => ({
        id: `item-${id}`,
        text: `투입 — 자판기가 받는 것은 ${label}이다`,
        when: { all: [askable(QUESTIONS[0]), { not: { flag: `ng-item-${id}` } }] } as Cond,
        next: [{ when: { var: 'price', is: id } as Cond, to: 'item-right' }, { to: `item-wrong-${id}` }],
      })),
      // 버튼
      ...BUTTONS.map(([id, label]) => ({
        id: `btn-${id}`,
        text: `버튼 — ${label} 버튼(${id})을 눌러야 한다`,
        when: { all: [askable(QUESTIONS[1]), { not: { flag: `ng-btn-${id}` } }] } as Cond,
        next: [{ when: { var: 'button', is: id } as Cond, to: 'btn-right' }, { to: `btn-wrong-${id}` }],
      })),
      // 거스름돈
      { id: 'change-take', text: '거스름돈 — 받아서 챙긴다', when: { all: [askable(QUESTIONS[2]), { not: { flag: 'ng-change-take' } }] } as Cond, next: 'change-wrong-take' },
      { id: 'change-again', text: '거스름돈 — 도로 넣어 다시 거래한다', when: { all: [askable(QUESTIONS[2]), { not: { flag: 'ng-change-again' } }] } as Cond, next: 'change-wrong-again' },
      { id: 'change-leave', text: '거스름돈 — 건드리지 않고 그대로 둔다', when: askable(QUESTIONS[2]), next: 'change-right' },
      { id: 'hold', text: '답을 걸지 않는다 — 더 조사한다', next: AFTER },
      { id: 'trade-start', text: '답을 걸지 않고 지금 자판기와 거래한다', next: 'trade-item' },
    ],
  },

  // 받는 것
  {
    id: 'item-right',
    kind: 'story',
    title: '확정: 받는 것',
    text: ITEMS.map(([id, label]) => ({
      text: `투입구 앞에 ${label}을 조심스럽게 가져다 댔다. 넣지는 않았다.\n투입구의 표시등이 [[loud|초록]]으로 켜졌다. 자판기가 낮게 ‘응’ 하고 대답했다.\n맞다. 오늘 밤 이 기계가 받는 것은 ${label}이다.`,
      when: { var: 'price', is: id } as Cond,
    })),
    onEnter: [{ flag: 'solved-item' }],
    next: AFTER,
  },
  ...ITEMS.map(([id, label]): Node => ({
    id: `item-wrong-${id}`,
    kind: 'story',
    title: '아니었다',
    text: `투입구 앞에 ${label}을 가져다 댔다. 넣지는 않았다.\n표시등이 [[shake|붉게]] 깜빡였고 투입구가 잠깐 오므라들었다. 손끝이 차가워졌다.\n이것은 아니다. 하마터면 손가락째 삼켜질 뻔했다.`,
    onEnter: wrongGuess(`ng-item-${id}`, `no-item-${id}`),
    next: AFTER,
  })),

  // 버튼
  {
    id: 'btn-right',
    kind: 'story',
    title: '확정: 버튼',
    text: BUTTONS.map(([id, label]) => ({
      text: `${label} 버튼(${id}) 위에 손바닥을 얹었다. 누르지는 않았다.\n버튼 아래에서 아주 작은 전류 소리가 올라왔다. 누르라는 듯이.\n맞다. 눌러야 할 것은 ${label} 버튼이다.`,
      when: { var: 'button', is: id } as Cond,
    })),
    onEnter: [{ flag: 'solved-button' }],
    next: AFTER,
  },
  ...BUTTONS.map(([id, label]): Node => ({
    id: `btn-wrong-${id}`,
    kind: 'story',
    title: '아니었다',
    text: `${label} 버튼(${id}) 위에 손바닥을 얹었다. 누르지는 않았다.\n버튼은 차가웠다. 그리고 [[whisper|아주 먼 곳에서]] 문이 한 번 닫히는 소리가 났다.\n이 버튼은 아니다.`,
    onEnter: wrongGuess(`ng-btn-${id}`, `no-btn-${id}`),
    next: AFTER,
  })),

  // 거스름돈
  {
    id: 'change-right',
    kind: 'story',
    title: '확정: 거스름돈',
    text: '반환구 앞에서 한참 서 있었다. 손을 뻗지 않았다. 뻗고 싶지도 않았다.\n반환구의 뚜껑이 [[whisper|아쉬운 듯]] 천천히 닫혔다.\n맞다. 거스름돈은 받지도, 도로 넣지도 않고 그대로 두고 떠나는 것이다.',
    onEnter: [{ flag: 'solved-change' }, { learn: 'change-debt', to: 'all' }, { learn: 'change-restart', to: 'all' }],
    next: AFTER,
  },
  {
    id: 'change-wrong-take',
    kind: 'story',
    title: '아니었다',
    text: '반환구의 동전을 쥐는 시늉을 했다. 손가락이 닿자마자 [[shake|손이 빠지지 않았다.]]\n힘껏 뿌리치고서야 풀렸다. 손바닥에 동전 모양의 자국이 오래 남았다.\n받는 것은 아니다.',
    onEnter: wrongGuess('ng-change-take', 'change-debt'),
    next: AFTER,
  },
  {
    id: 'change-wrong-again',
    kind: 'story',
    title: '아니었다',
    text: '반환구의 동전을 투입구에 가져다 댔다. 투입구가 반가운 듯 입을 벌렸다.\n표시등이 처음으로 돌아갔다. [[flicker|0, 0, 0.]] 서둘러 손을 뺐다.\n도로 넣는 것은 아니다.',
    onEnter: wrongGuess('ng-change-again', 'change-restart'),
    next: AFTER,
  },
]

// ───────────────────────── 단서 글 (후보 하나가 "아니다"를 알려 주는 관찰) ─────────────────────────

const SLOT_TEXT: Record<ItemId, string> = {
  coin: '투입구 가장자리의 긁힌 자국은 모두 길고 얇다. 둥글고 작은 것이 지나간 흔적은 하나도 없다. 낡은 동전은 이 입구가 받지 않는 모양이다.',
  photo: '투입구 안쪽 가장자리에 종이가 스친 흔적이 하나도 없다. 얇은 종이는 이 입구가 받지 않는 모양이다. 가족사진은 아니다.',
  badge: '투입구에는 단단한 플라스틱 모서리가 꽂힌 자국이 하나도 없다. 사원증처럼 딱딱한 것은 받지 않는 모양이다.',
}
const TRAY_TEXT: Record<ItemId, string> = {
  coin: '반환구 안쪽 벽에는 동전이 굴러 나온 흔적이 전혀 없다. 바닥도 깨끗하다. 낡은 동전은 이 기계가 내주지도 받지도 않는다.',
  photo: '반환구 안쪽 벽에 종이 조각이 하나도 끼어 있지 않다. 사진을 받는 기계라면 반드시 남았을 부스러기가 없다.',
  badge: '반환구 안쪽에서 카드 끈이 걸렸던 자국을 찾아보았다. 하나도 없다. 사원증을 받는 기계의 모습이 아니다.',
}
const DUST_TEXT: Record<ButtonId, string> = {
  A: '왼쪽 버튼에만 먼지가 두껍게 쌓여 있다. 오랫동안 아무도 누르지 않았다. 이 칸은 아니다.',
  B: '가운데 버튼 가장자리에만 먼지가 두껍다. 눌린 흔적이 없다. 이 칸은 아니다.',
  C: '오른쪽 버튼은 먼지가 쌓여 있고 손자국 하나 없다. 이 칸은 아니다.',
}
const EAR_TEXT: Record<ButtonId, string> = {
  A: '왼쪽 버튼 아래에서는 아무 소리도 나지 않는다. 회로가 이어져 있지 않은 것 같다. 이 칸은 아니다.',
  B: '가운데 버튼 아래는 죽은 듯 조용하다. 다른 칸에서 올라오는 전류 소리가 이 칸에서만 들리지 않는다. 이 칸은 아니다.',
  C: '오른쪽 버튼 아래가 조용하다. 전류가 이 칸으로는 흐르지 않는다. 이 칸은 아니다.',
}

export const vending: Scenario = {
  id: 'vending',
  code: 'A-03',
  name: '거래하는 자판기',
  type: 'object',
  party: { min: 1, max: 8 },
  map: { x: 82, y: 30 },
  blurb: '지하 2층 휴게실의 자판기. 동전이 아닌 무언가를 받는다. 정전이 난 밤에도 이 기계만은 켜져 있다.',
  summary: '지하 2층 직원 휴게실의 오래된 자판기. 버튼 어디에도 이름이 적혀 있지 않고, 투입구에는 \"무엇이든 넣으세요\"라는 문구만 있다. 정전이 나도 이 기계는 꺼지지 않는다.',
  observation: [
    '지하 2층 직원 휴게실에 있다. 버튼은 세 개(왼쪽·가운데·오른쪽)이고 상품 이름은 하나도 적혀 있지 않다.',
    '투입구에는 \"무엇이든 넣으세요\"라고 적혀 있다. 동전 투입구라기에는 너무 넓다.',
    '정전이 나도 꺼지지 않고, 새벽 네 시가 지나면 표시등이 한 칸씩 어두워진다.',
  ],
  manual: [
    '자판기와 거래할 때는 오늘 밤 받는 것만 넣는다.',
    '눌러야 할 버튼은 매일 다르다. 이전 근무자의 기록을 믿지 않는다.',
    '거스름돈에 관해서는 이 매뉴얼에 적지 않는다.',
    '(이하 내용은 지워져 있다.)',
  ],
  dossier: [
    {
      id: 'found',
      title: '발견 경위',
      lines: [
        '야간 점검 중 정전이 난 지하 2층 휴게실에서 자판기 한 대만 켜져 있다는 보고가 접수되었다. 시설 도면에는 이 자판기가 없다.',
        '이 방에서 밤을 보낸 근무자들은 아침에 \"무언가 하나가 비어 있다\"고 말했지만 무엇이 비었는지는 말하지 못했다.',
      ],
    },
    {
      id: 'machine',
      title: '거래의 원리',
      lines: [
        '자판기는 받은 것의 무게만큼만 내준다. 가벼운 것을 넣으면 가벼운 것이, 소중한 것을 넣으면 소중한 것이 나온다.',
        '오늘 밤 받는 것은 하나로 정해져 있다. 다른 것을 넣으면 그것은 투입구에서 돌려받을 수 없다.',
      ],
      unlock: { hint: 'machine-sums' },
    },
    {
      id: 'door',
      title: '휴게실의 문',
      lines: [
        '정전 중에는 전자식 도어락이 풀리지 않는다. 문은 거래가 한 번 정확하게 끝났을 때에만 열린다.',
        '문 아래 틈으로 새벽이 올 때까지 바람이 들어온다. 그 바람에서는 항상 커피 냄새가 난다.',
      ],
      unlock: { hint: 'door-locked' },
    },
    {
      id: 'writing',
      title: '벽의 낙서',
      lines: [
        '자판기 옆 벽에 전임자들의 낙서가 빼곡하다. 대부분 상품 번호이거나 날짜이고, 몇 개는 \"받지 마\"라고 읽힌다.',
        '글씨는 모두 다르지만 같은 속도로 눌러 쓴 것처럼 보인다.',
      ],
      unlock: { hint: 'wall-writing' },
    },
    {
      id: 'ledger',
      title: '장부',
      lines: [
        '동이 트면 자판기는 장부를 정산한다. 정산되지 않은 거래는 그것이 \"가져갈 수 있는 것\" 중에서 가장 가까운 것으로 메워진다.',
        '전임자 중 몇 명은 아침에 이름이 비어 있었다.',
      ],
      unlock: { hint: 'dawn-collect' },
    },
    {
      id: 'voice',
      title: '자판기의 목소리',
      lines: [
        '자판기가 말을 걸면 거짓으로 답해서는 안 된다. 정직하게 답한 근무자는 아침이 올 때까지 아무 일도 겪지 않았다.',
        '거짓으로 답한 근무자의 장부에는 다음 날 한 줄이 더 늘어 있었다.',
      ],
      unlock: { hint: 'machine-honest' },
    },
    {
      id: 'change',
      title: '거스름돈',
      lines: [
        '거래가 끝나면 반환구에 거스름돈이 떨어진다. 그 금액은 항상 같다 — 방금 넣은 것의 값만큼이다.',
        '받으면 빚이 되고, 도로 넣으면 거래가 처음부터 시작된다. 그대로 두고 떠나는 것이 유일하게 끝나는 방법이다.',
      ],
      unlock: { hint: 'change-restart' },
    },
  ],
  items: [
    { id: 'coin', name: '낡은 동전', text: '가장자리가 닳은 동전. 언제부터 주머니에 있었는지 기억나지 않는다.' },
    { id: 'photo', name: '가족사진', text: '지갑에서 늘 꺼내 보던 사진. 모서리가 접혀 있다.' },
    { id: 'badge', name: '사원증', text: '이름과 얼굴이 박힌 플라스틱 카드. 이게 없으면 이 건물에서 아무도 아닌 사람이 된다.' },
  ],
  facts: [
    { id: 'machine-sums', text: '자판기는 받은 것의 무게만큼만 내준다.' },
    { id: 'door-locked', text: '휴게실 문은 정전 중에는 열리지 않는다. 자판기만 켜져 있다.' },
    { id: 'wall-writing', text: '자판기 옆 벽에 전임자들의 낙서가 빼곡하다.' },
    { id: 'change-debt', text: '거스름돈을 손에 쥐는 순간 그것은 빚이 된다.' },
    { id: 'change-restart', text: '거스름돈을 도로 넣으면 거래가 처음부터 다시 시작된다.' },
    { id: 'dawn-collect', text: '동이 트면 자판기는 장부를 정산한다. 정산되지 않은 것은 가져간다.' },
    { id: 'machine-honest', text: '자판기가 말을 걸면 거짓으로 답해서는 안 된다.' },
    // 판마다 바뀌는 값에 대한 사실: "후보 하나가 아니다" (조사 보드에만 붙고 단서 노트에는 남지 않는다)
    ...ITEMS.map(([id, label]) => ({ id: `no-item-${id}`, text: `자판기가 받는 것은 ${label}이 아니다.`, run: true })),
    ...BUTTONS.map(([id, label]) => ({ id: `no-btn-${id}`, text: `눌러야 할 버튼은 ${label} 버튼이 아니다.`, run: true })),
  ],
  board: {
    goal: '동이 트기 전에, 자판기와 정확한 거래를 끝내고 이 휴게실의 문을 연다.',
    questions: [
      {
        id: 'item',
        text: '자판기는 오늘 밤 무엇을 받는가?',
        facts: ITEM_FACTS,
        solved: { flag: 'solved-item' },
        answer: ITEMS.map(([id, label]) => ({ text: `${label}이다.`, when: { var: 'price', is: id } as Cond })),
      },
      {
        id: 'button',
        text: '어느 버튼을 눌러야 하는가?',
        facts: BUTTON_FACTS,
        solved: { flag: 'solved-button' },
        answer: BUTTONS.map(([id, label]) => ({ text: `${label} 버튼(${id})이다.`, when: { var: 'button', is: id } as Cond })),
      },
      {
        id: 'change',
        text: '거스름돈은 어떻게 해야 하는가?',
        facts: CHANGE_FACTS,
        solved: { flag: 'solved-change' },
        answer: '받지도, 도로 넣지도 않고 그대로 두고 떠난다.',
      },
    ],
  },
  vars: [
    { id: 'price', pick: [...ITEM_ORDER] },
    { id: 'button', pick: [...BUTTON_ORDER] },
  ],
  clock: { labels: ['자정', '새벽 한 시', '새벽 두 시', '새벽 세 시', '새벽 네 시', '동이 틀 무렵'] },
  deadline: { time: 5, node: 'dawn-end' },
  onAllPanic: 'collapse-end',
  start: 'arrive',
  nodes: [
    // ───────────────────────── 도착 ─────────────────────────
    {
      id: 'arrive',
      period: 'night',
      kind: 'story',
      title: '정전',
      text: '야간 점검 중에 건물 전체가 [[flicker|꺼졌다.]] 비상등마저 들어오지 않았다. 더듬어서 지하 2층 휴게실로 내려왔다.\n문이 등 뒤에서 [[loud|철컥]] 하고 잠겼다. 전자식 도어락이다. 정전 중에는 열리지 않는다.\n어둠 속에서 단 하나, 자판기만 켜져 있다. 불빛이 방 안을 푸르게 물들이고 있다. 주머니에는 낡은 동전, 가족사진, 사원증이 들어 있다.',
      onEnter: [
        { give: 'coin', to: 'all' },
        { give: 'photo', to: 'all' },
        { give: 'badge', to: 'all' },
      ],
      next: 'first-look',
    },
    {
      id: 'first-look',
      kind: 'personal',
      title: '첫 인상',
      text: '숨을 고르고 방 안을 둘러본다. 먼저 눈이 가는 곳을 살핀다.',
      options: [
        {
          id: 'front',
          text: '자판기 앞면을 들여다본다',
          result: '자판기 앞에 선다. 진열창에는 아무것도 들어 있지 않다. 그런데도 버튼 세 개에는 번호 대신 아무 표시도 없다.\n투입구 위에 작은 글씨가 붙어 있다. “[[whisper|받은 것의 무게만큼만 내어 드립니다.]]”',
          effects: [{ learn: 'machine-sums', to: 'actor' }],
        },
        {
          id: 'door',
          text: '휴게실 문을 다시 밀어 본다',
          result: '문손잡이는 꿈쩍도 하지 않는다. 문 옆 도어락의 표시등은 꺼져 있다.\n문틈 아래로 바람이 새어 들어온다. 어디선가 커피 냄새가 난다. 정전 중인데도.',
          effects: [{ learn: 'door-locked', to: 'actor' }],
        },
        {
          id: 'floor',
          text: '바닥과 벽을 둘러본다',
          result: '카펫은 닳아서 바닥의 시멘트 색이 드러나 있다. 자판기 앞의 한 곳만 유독 깊게 닳았다. 누군가 오래 서 있던 자리다.\n자판기 옆 벽에는 낙서가 빼곡하다. 읽으려면 가까이 가야 한다.',
          effects: [{ learn: 'wall-writing', to: 'actor' }],
        },
        {
          id: 'pocket',
          text: '주머니를 뒤진다',
          result: '주머니에는 세 가지뿐이다. 낡은 동전, 모서리가 접힌 가족사진, 목에서 풀어 둔 사원증.\n하나같이 오래 가지고 다닌 것들이다. 이 중 하나를 잃게 된다면 무엇이 가장 아플까, 하는 생각이 불쑥 든다.',
        },
      ],
      next: 'patrol',
    },

    // ───────────────────────── 조사 ─────────────────────────
    {
      id: 'patrol',
      kind: 'split',
      title: '휴게실 조사',
      text: [
        { text: '자정. 방 안에는 자판기의 푸른 불빛과 낮은 모터 소리뿐이다. 어디부터 살필지 정한다. 한 번에 한 곳씩만 살필 수 있다.', when: { time: { max: 0 } } },
        { text: '새벽 한 시. 자판기의 불빛이 아까보다 한 칸 낮아진 것 같다. 방 안이 더 좁아졌다.', when: { time: { min: 1, max: 1 } } },
        { text: '새벽 두 시. 모터 소리가 일정한 박자를 찾았다. 마치 누군가 숨을 세고 있는 것처럼.', when: { time: { min: 2, max: 2 } } },
        { text: '새벽 세 시. [[flicker|표시등이 깜빡인다.]] 이제 살필 수 있는 곳은 얼마 남지 않았다.', when: { time: { min: 3 } } },
        { text: '[[whisper|(눈이 침침하다. 벽의 글씨가 흔들려 보인다.)]]', when: { stat: 'sanity', max: 3, by: 'me' } },
      ],
      actions: [
        { id: 'slot', text: '투입구 안쪽을 손끝으로 더듬어 살핀다', max: 1, ...seenGate('slot') },
        { id: 'tray', text: '반환구 안쪽에 얼굴을 대고 살핀다', max: 1, ...seenGate('tray') },
        { id: 'dust', text: '버튼 세 개의 먼지를 비교해 본다', max: 1, ...seenGate('dust') },
        { id: 'ear', text: '버튼 아래쪽에 귀를 대고 소리를 듣는다', max: 1, ...seenGate('ear') },
        { id: 'graffiti', text: '벽의 낙서를 가까이서 읽는다', max: 1, ...seenGate('graffiti') },
        { id: 'receipt', text: '바닥에 떨어진 영수증 종이를 주워 읽는다', max: 1, ...seenGate('receipt') },
        { id: 'study', text: '메모를 모아 머릿속을 정리한다', max: 1, ...seenGate('study') },
        { id: 'coffee', text: '종이컵에 믹스커피를 타서 마신다', calming: true },
        // 혼자일 때만: 여럿이면 누군가 혼자 서둘러 끝내 버리지 못하게 한다 (여럿은 생각 정리나 마지막 결정에서 거래한다)
        { id: 'trade-now', text: '더 살피지 않고 지금 자판기와 거래한다', when: { party: { max: 1 } } },
      ],
      private: withSeen([
        // 투입구: 관찰이 높으면 두 후보를 한꺼번에 지운다
        ...ITEM_ORDER.flatMap((price): PrivateFinding[] => {
          const x = nextOf(ITEM_ORDER, price, 1)
          const y = nextOf(ITEM_ORDER, price, 2)
          return [
            {
              action: 'slot',
              when: { all: [{ var: 'price', is: price } as Cond, insight3] },
              text: `${SLOT_TEXT[x]}\n${SLOT_TEXT[y]}\n두 가지가 모두 아니라면, 남은 하나뿐이다. 손끝이 [[loud|확신]]으로 따끔했다.`,
              effects: [
                { learn: `no-item-${x}`, to: 'actor' as const },
                { learn: `no-item-${y}`, to: 'actor' as const },
              ],
            },
            {
              action: 'slot',
              when: { var: 'price', is: price } as Cond,
              text: `${SLOT_TEXT[x]}\n나머지 둘 중 무엇인지는 이것만으로는 모르겠다.`,
              effects: [{ learn: `no-item-${x}`, to: 'actor' as const }],
            },
          ]
        }),
        // 반환구: 다른 후보 하나를 지운다
        ...ITEM_ORDER.map((price): PrivateFinding => {
          const y = nextOf(ITEM_ORDER, price, 2)
          return {
            action: 'tray',
            when: { var: 'price', is: price } as Cond,
            text: `${TRAY_TEXT[y]}\n여기서도 남은 둘을 가르지는 못한다.`,
            effects: [{ learn: `no-item-${y}`, to: 'actor' as const }],
          }
        }),
        // 버튼 먼지
        ...BUTTON_ORDER.flatMap((button): PrivateFinding[] => {
          const p = nextOf(BUTTON_ORDER, button, 1)
          const q = nextOf(BUTTON_ORDER, button, 2)
          return [
            {
              action: 'dust',
              when: { all: [{ var: 'button', is: button } as Cond, insight3] },
              text: `${DUST_TEXT[p]}\n${DUST_TEXT[q]}\n두 칸이 모두 죽어 있다면 남은 칸뿐이다. [[loud|이 칸이다.]]`,
              effects: [
                { learn: `no-btn-${p}`, to: 'actor' as const },
                { learn: `no-btn-${q}`, to: 'actor' as const },
              ],
            },
            {
              action: 'dust',
              when: { var: 'button', is: button } as Cond,
              text: `${DUST_TEXT[p]}\n나머지 두 칸은 구별이 되지 않는다.`,
              effects: [{ learn: `no-btn-${p}`, to: 'actor' as const }],
            },
          ]
        }),
        // 버튼 소리
        ...BUTTON_ORDER.map((button): PrivateFinding => {
          const q = nextOf(BUTTON_ORDER, button, 2)
          return {
            action: 'ear',
            when: { var: 'button', is: button } as Cond,
            text: `${EAR_TEXT[q]}\n다른 칸에서는 같은 소리가 났다. 이것만으로 하나를 고를 수는 없다.`,
            effects: [{ learn: `no-btn-${q}`, to: 'actor' as const }],
            later: [{ stat: 'sanity' as const, add: -1, to: 'actor' as const }],
          }
        }),
        // 고정된 규칙: 거스름돈
        {
          action: 'graffiti',
          text: '벽의 낙서를 한 줄씩 읽는다. 날짜와 상품 번호 사이에 같은 글씨가 반복된다.\n[[shake|받지 마.]] [[shake|받지 마.]] [[shake|받지 마.]]\n그 아래 누군가 더 작게 적었다. “손이 안 빠진다. 거스름돈을 쥐면 그게 빚이 된다.”',
          effects: [{ learn: 'change-debt', to: 'actor' }],
        },
        {
          action: 'receipt',
          text: '바닥의 영수증은 아직 따뜻하다. 항목 칸에는 아무것도 적혀 있지 않고, 맨 아래 줄만 인쇄되어 있다.\n“거스름돈 반환 시 거래는 [[whisper|처음부터]] 다시 시작됩니다.”',
          effects: [{ learn: 'change-restart', to: 'actor' }],
        },
        {
          action: 'study',
          text: '지금까지 눈으로 본 것을 순서대로 종이에 적었다. 적고 나니 서로 맞물리지 않던 것들이 조금씩 겹쳐 보인다.\n머리가 맑아졌다. 글자 사이의 빈틈이 보이기 시작한다.',
          effects: [{ stat: 'insight', add: 1, to: 'actor' }],
        },
        {
          action: 'coffee',
          text: '믹스커피는 뜨겁고 지나치게 달았다. 두 손으로 컵을 감싸고 있으니 손끝에 감각이 돌아왔다.\n잠시 마음이 가라앉았다.',
          effects: [{ stat: 'sanity', add: 2, to: 'actor' }, { heal: 'actor' }],
        },
      ]),
      outcomes: [
        {
          when: { picked: 'trade-now' },
          text: '결심했다. 더 살피면 살필수록 잃는 것이 늘어날 것 같다. 자판기 앞에 선다.',
          next: 'trade-item',
        },
        {
          text: [
            { text: '한 곳을 살피고 돌아와 자판기 앞에 섰다. 자판기의 불빛이 한 칸 낮아졌다.' },
            { text: '모터 소리가 조금 더 가까워졌다.', when: { time: { min: 2 } } },
          ],
          effects: [{ time: 1 }],
          next: TO_THINK,
        },
      ],
    },

    ...THINK_NODES,

    // ───────────────────────── 사건 ─────────────────────────
    {
      id: 'event-hum',
      kind: 'vote',
      title: '혼자 울리는 소리',
      text: '자판기가 [[whisper|낮게]] 울린다. 모터가 아니라 목소리 같은 소리다. 반환구 쪽에서 [[flicker|딸랑, 딸랑]] 하고 동전이 떨어지는 소리가 한참 이어진다. 아무도 투입하지 않았는데.',
      choices: [
        {
          id: 'listen',
          text: '숨을 죽이고 소리가 끝날 때까지 듣는다',
          result: '귀를 기울였다. 동전 소리는 정확히 같은 간격으로 이어졌다. 열, 열하나, 열둘, 그러다 어느 순간 뚝 그쳤다.\n벽에 걸린 시계가 소리 없이 한 칸을 건너뛴 것 같았다. 동이 트면 이 기계는 장부를 정산한다는 것을 이상하게도 알 것 같았다.',
          effects: [{ flag: 'hum' }, { learn: 'dawn-collect', to: 'all' }],
          later: [{ stat: 'sanity', add: -1, to: 'all' }],
          next: AFTER_HUM,
        },
        {
          id: 'unplug',
          text: '전원 코드를 찾아 뽑아 버린다',
          result: '벽 뒤를 더듬어 코드를 찾았다. 플러그는 벽이 아니라 바닥의 어디론가 이어져 있었다. 힘껏 잡아당기자 소리는 멎었다.\n그러나 표시등은 꺼지지 않았다. 오히려 아까보다 환하게 켜졌다. 한참을 씨름하는 사이에 시간이 흘렀다.',
          effects: [{ flag: 'hum' }, { time: 1 }],
          next: AFTER_HUM,
        },
        {
          id: 'ignore',
          text: '신경 쓰지 않고 하던 일로 돌아간다',
          result: '소리는 한동안 계속되다가 스스로 잦아들었다. 이마에 땀이 났다. 정전 중인데도 방 안은 이상하게 따뜻했다.',
          effects: [{ flag: 'hum' }],
          next: AFTER_HUM,
        },
      ],
    },
    {
      id: 'event-voice',
      kind: 'vote',
      title: '자판기의 목소리',
      text: '자판기의 푸른 불빛이 천천히 깜빡이더니, 어디서도 나지 않는 목소리가 방 안에 퍼졌다.\n[[whisper|“무엇을 도와드릴까요?”]]\n정중하고 지쳐 있는 목소리다. 대답을 기다리는 것 같다.',
      choices: [
        {
          id: 'honest',
          text: '“이 방에서 나가고 싶습니다.” 솔직하게 말한다',
          result: '입이 마르는 것을 참으며 대답했다. 정적이 흘렀다.\n[[whisper|“…알겠습니다.”]] 목소리는 오래 묵은 방명록을 덮는 것 같은 소리로 말했다. 자판기가 한 번 [[loud|웅]] 하고 울렸다.',
          effects: [{ flag: 'voice' }, { flag: 'honest' }, { learn: 'machine-honest', to: 'all' }],
          next: NEXT_ROUND,
        },
        {
          id: 'lie',
          text: '“필요한 건 없습니다.” 아무것도 아니라고 한다',
          result: '아무 일도 없었다는 듯 대답했다. 자판기가 한참 침묵했다.\n[[shake|“…그렇군요.”]] 목소리에서 무언가가 접히는 소리가 났다. 방 안의 공기가 한 칸 차가워졌다.',
          effects: [{ flag: 'voice' }, { flag: 'lied' }],
          later: [{ stat: 'sanity', add: -2, to: 'all' }],
          next: NEXT_ROUND,
        },
        {
          id: 'silent',
          text: '아무 말도 하지 않는다',
          result: '입을 다물고 있었다. 목소리는 같은 질문을 두 번 더 반복하더니 이내 사그라들었다.\n[[whisper|“…나중에 다시 여쭙겠습니다.”]]',
          effects: [{ flag: 'voice' }],
          next: NEXT_ROUND,
        },
      ],
    },

    // ───────────────────────── 결정 ─────────────────────────
    {
      id: 'gather',
      kind: 'vote',
      title: '마지막 결정',
      text: [
        { text: '표시등이 한 칸씩 꺼져 가고 있다. 더 조사할 수 있는 시간은 거의 없다. 이제 이 방을 떠날 길을 골라야 한다.' },
        { text: '자판기가 지금 이 순간에도 대답을 기다리는 것 같다.', when: { flag: 'honest' } },
        { text: '[[whisper|자판기의 장부에 한 줄이 더 늘어났다.]]', when: { flag: 'lied' } },
      ],
      choices: [
        {
          id: 'trade',
          text: '자판기와 거래한다',
          result: '자판기 앞에 선다. 푸른 불빛이 얼굴을 훑는다. 주머니 속의 것들이 갑자기 무겁게 느껴진다.',
          next: 'trade-item',
        },
        {
          id: 'wait',
          text: '아무것도 하지 않고 새벽이 오기를 기다린다',
          result: '벽에 등을 대고 앉아 눈을 감았다. 자판기의 모터 소리가 점점 가까워졌다 멀어졌다를 반복했다.',
          next: [{ when: { flag: 'honest' }, to: 'quiet-end' }, { to: 'dawn-end' }],
        },
        {
          id: 'more',
          text: '시간이 얼마 남지 않았지만 조금 더 살핀다',
          result: '손목시계를 보았다. 초침이 [[shake|빨라진 것 같다.]] 그래도 한 번만 더.',
          effects: [{ time: 1 }],
          next: 'patrol',
        },
      ],
    },
    {
      id: 'trade-item',
      kind: 'vote',
      title: '거래: 무엇을 넣을까',
      text: '투입구가 천천히 입을 벌린다. 한 번 넣은 것은 돌려받을 수 없다.\n주머니에서 하나를 꺼낸다.',
      choices: [
        ...ITEMS.map(([id, label]) => ({
          id: `put-${id}`,
          text: `${label}을 넣는다`,
          when: { item: id, by: 'any' } as Cond,
          result: `${label}을 투입구에 밀어 넣었다. 철컥, 하고 안쪽에서 무언가가 그것을 물었다.`,
          effects: [{ take: id, from: 'all' as const }],
          next: [{ when: { var: 'price', is: id } as Cond, to: 'trade-button' }, { to: 'erased-end' }],
        })),
        { id: 'back', text: '아직 아니다. 조금 더 생각해 본다', next: NEXT_ROUND },
      ],
    },
    {
      id: 'trade-button',
      kind: 'vote',
      title: '거래: 어느 버튼을 누를까',
      text: '투입구 안쪽에서 [[loud|딸깍]] 소리가 났다. 세 개의 버튼에 동시에 희미한 불이 들어왔다.\n손가락을 들어 하나를 고른다.',
      choices: BUTTONS.map(([id, label]) => ({
        id: `press-${id}`,
        text: `${label} 버튼(${id})을 누른다`,
        next: [{ when: { var: 'button', is: id } as Cond, to: 'trade-change' }, { to: 'slot-end' }],
      })),
    },
    {
      id: 'trade-change',
      kind: 'vote',
      title: '거래: 거스름돈',
      text: '버튼 아래에서 모터가 길게 돌았다. 덜컹, 하고 반환구에 무언가 떨어졌다.\n[[whisper|거스름돈이다.]] 동전 몇 개가 반환구 안쪽에서 푸른 불빛을 받고 있다.',
      choices: [
        { id: 'take', text: '거스름돈을 챙긴다', next: 'debt-end' },
        { id: 'again', text: '거스름돈을 도로 투입구에 넣는다', next: 'greedy-end' },
        { id: 'leave', text: '거스름돈에 손대지 않고 문 쪽으로 돌아선다', next: 'true-end' },
      ],
    },

    // ───────────────────────── 엔딩 ─────────────────────────
    {
      id: 'true-end',
      kind: 'ending',
      tier: 'true',
      title: '정확한 거래',
      text: '문 쪽으로 돌아서자 등 뒤에서 [[loud|철컥]] 하고 도어락이 풀렸다. 정전은 아직 끝나지 않았는데도.\n복도에는 새벽 첫 불이 들어와 있었다. 뒤를 돌아보지 않았다. 반환구의 거스름돈은 그대로 있었고, 자판기의 표시등은 한 칸씩 천천히 꺼졌다.\n아침 점검표에는 지하 2층 휴게실에 자판기가 없다고 적혀 있다. 하지만 가끔 야간 근무자 중 누군가가 주머니를 뒤적이다 말한다. “내가 뭘 넣었더라.” 그리고 기억해 낸다. [[whisper|그것은 아무것도 아니었다고.]]',
    },
    {
      id: 'quiet-end',
      kind: 'ending',
      tier: 'good',
      title: '조용한 아침',
      text: '동이 틀 무렵 도어락이 스스로 풀렸다. 거래는 하지 않았다. 정직하게 대답한 값이다.\n자판기는 마지막까지 불을 켜 두고 있었다. 나가는 길에 한 번 돌아보았다. 투입구가 [[whisper|아쉬운 듯]] 천천히 닫혔다.\n그날 이후 지하 2층 휴게실을 지날 때마다 주머니가 가볍다. 무엇이 빠졌는지는 아직 모른다.',
    },
    {
      id: 'slot-end',
      kind: 'ending',
      tier: 'neutral',
      title: '엉뚱한 칸',
      text: '자판기가 [[loud|덜컹]] 하고 무언가를 내놓았다. 빈 캔이었다. 흔들어 보니 안에서 아무 소리도 나지 않았다.\n문은 열리지 않았다. 새벽까지 기다린 끝에 점검조가 와서 밖에서 문을 열어 주었다. 정전은 환풍기 고장 때문이라고 했다.\n투입구에 넣은 것은 돌아오지 않았다. 그것이 무엇이었는지는 사람들이 묻지 않았고, 아무도 대답하지 않았다.',
    },
    {
      id: 'erased-end',
      kind: 'ending',
      tier: 'bad',
      title: '지워진 것',
      text: '투입구가 [[shake|우적]] 하고 그것을 씹었다. 내놓은 것은 아무것도 없었다.\n정신을 차렸을 때 휴게실 문은 열려 있었고 아침이었다. 주머니를 더듬어 보니 세 가지 중 하나가 없었다. 처음부터 없었던 것처럼.\n이름이 불려도 대답하는 데 한참이 걸렸다. 사람들은 무엇을 잃었는지 묻지 않았다. 스스로도 묻지 못했다. [[whisper|무엇을 잃었는지 기억나지 않으니까.]]',
    },
    {
      id: 'debt-end',
      kind: 'ending',
      tier: 'bad',
      title: '빚',
      text: '거스름돈을 손에 쥐었다. 따뜻했다. 문이 열렸다. 그런데 손이 [[shake|펴지지 않았다.]]\n복도로 나온 뒤에도, 집에 돌아온 뒤에도 손에서 동전은 떨어지지 않았다. 아무도 그것을 보지 못했다. 쥔 사람만 느꼈다.\n매일 밤 열두 시가 되면 손바닥에서 낮은 모터 소리가 올라온다. [[whisper|이번에는 무엇을 넣으시겠습니까.]]',
    },
    {
      id: 'greedy-end',
      kind: 'ending',
      tier: 'bad',
      title: '다시 처음부터',
      text: '거스름돈을 도로 넣었다. 표시등이 [[flicker|0, 0, 0]]으로 돌아갔다. 주머니를 뒤졌다. 아직 남은 것이 있었다. 하나만 더, 하나만 더.\n하나씩 넣을 때마다 거스름돈이 돌아왔고, 그것을 또 넣었다. 자판기는 한 번도 싫은 표정을 짓지 않았다.\n동이 틀 무렵 점검조가 문을 열었을 때 휴게실에는 자판기와, 투입구 앞에 선 한 사람의 그림자만 있었다.',
    },
    {
      id: 'dawn-end',
      kind: 'ending',
      tier: 'bad',
      title: '정산',
      text: '동이 텄다. 푸른 불빛이 [[loud|한꺼번에]] 켜졌다. 자판기가 장부를 펼쳤다.\n정산되지 않은 거래는 가져갈 수 있는 것 중 가장 가까운 것으로 메워졌다. 이번에는 이름이었다.\n점검조가 문을 열었을 때 휴게실에는 아무도 없었다. 근무표에는 그날 야간 근무자의 칸이 비어 있었다. 처음부터 비어 있었다는 듯이.',
    },
    {
      id: 'collapse-end',
      kind: 'ending',
      tier: 'bad',
      title: '정신 상실',
      text: '더는 일어설 수 없었다. 바닥에 주저앉아 자판기의 푸른 불빛만 바라보았다.\n자판기가 조용히 모터를 돌렸다. 반환구에서 동전이 떨어지는 소리가 났다. 하나, 둘, 셋. [[whisper|거스름돈이 몇 개인지 세다가 잠들었다.]]',
    },
  ],
}
