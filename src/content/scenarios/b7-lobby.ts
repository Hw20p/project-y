// B7 로비 — 시나리오 모드의 첫 대상(세로 시제품).
//
// 진실: B7 로비는 "센다". 엘리베이터로 온 사람 수를 방명록에 적어 두고, 올라갈 때 그 수와 맞아야 보내 준다.
// 소파 하나에 앉아 있는 "한 명 더"가 일행에 끼어들려 한다 (거울에 비치는 한 명, 방명록의 마지막 서명, 따뜻한 소파).
// 올라가려면 ① 엘리베이터에서 아무 버튼도 누르지 않고 ② 거울을 보지 않고 ③ 전화로 인원을 정직하게 답하고
// ④ 따뜻한 소파(판마다 다른 자리)에 "여기 계세요"라고 말해 두고 가야 한다. 하나라도 어긋나면 한 명이 더 따라온다.
//
// 판마다 바뀌는 값: seat(따뜻한 소파 a·b·c), stairs(난간 기둥 수 9·11·13).
// 단서는 사람마다 다르게 얻고(방명록·소파·패널·난간·밤의 개인 행동) 말로 합쳐야 한다. 시계는 조명의 단계(5가 되면 암전).
import type { Cond, Node, PrivateFinding, Route, Scenario } from '../../scenario/types.ts'

/** 소파 세 개: 따뜻한 쪽은 판마다 다르다 */
const SOFAS = [
  ['a', '왼쪽'],
  ['b', '가운데'],
  ['c', '오른쪽'],
] as const

/** 난간 기둥 수 후보: 판마다 하나가 정해진다 (내려가야 할 칸은 이보다 하나 적다) */
const STAIRS = [9, 11, 13] as const
const STAIR_STEPS = { 9: '여덟', 11: '열', 13: '열두' } as const

const insight3: Cond = { stat: 'insight', min: 3, by: 'actor' }

/** 조사 장소는 판마다 한 번만 살필 수 있다 (같은 곳을 다시 보는 데 칸을 쓰지 못하게 한다) */
const SEEN_ACTIONS = ['book', 'sofa-a', 'sofa-b', 'sofa-c', 'panel', 'rail']
const seenGate = (id: string) => ({ when: { not: { flag: `seen-${id}` } } as Cond, locked: '이미 살펴본 곳이다' })
const withSeen = (entries: PrivateFinding[]): PrivateFinding[] =>
  entries.map((e) => (SEEN_ACTIONS.includes(e.action) ? { ...e, effects: [...(e.effects ?? []), { flag: `seen-${e.action}` }] } : e))

// ───────────────────────── 조사 보드와 회의 ─────────────────────────
// 보드의 의문 세 개는 서로 다른 곳에서 단서가 나온다. 회의에서 답을 걸면 실제로 해 보고, 틀리면 시간과 마음을 잃는다.

const LIFT_FACTS = ['door-closed', 'panel-press', 'panel-nobutton', 'mirror-extra']
const SOFA_FACTS = ['sofa-dent', 'warm-seat', 'greet-rule', ...SOFAS.flatMap(([id]) => [`warm-${id}`, `cold-${id}`])]
const STAIRS_FACTS = ['stairs-count', 'stairs-rule', 'rail-near10', 'rail-over12', ...STAIRS.map((n) => `rail-${n}`)]
const QUESTIONS = [
  { id: 'lift', facts: LIFT_FACTS },
  { id: 'sofa', facts: SOFA_FACTS },
  { id: 'stairs', facts: STAIRS_FACTS },
] as const

const known = (ids: readonly string[]): Cond => ({ any: ids.map((knows): Cond => ({ knows })) })
/** 회의에서 물어볼 수 있는 의문: 아직 안 풀렸고, 파티 중 누군가 단서를 알고 있다 */
const askable = (q: (typeof QUESTIONS)[number]): Cond => ({ all: [{ not: { flag: `solved-${q.id}` } }, known(q.facts)] })
/** 한 바퀴가 끝나면 회의로 간다. 물어볼 의문이 하나도 없으면 건너뛴다. */
const TO_MEETING: Route = [{ when: { any: QUESTIONS.map(askable) }, to: 'meeting' }, { to: 'night' }]

/** 틀린 답: 그 답이 지워지고, 모두의 정신력이 크게 깎인다 (조사 라운드가 두 번뿐이라 시간은 건드리지 않는다) */
const wrongGuess = (flag: string, ...more: { learn: string }[]) =>
  [{ flag }, ...more.map((m) => ({ learn: m.learn, to: 'all' as const })), { stat: 'sanity' as const, add: -2, to: 'all' as const }]

const MEETING_NODES: Node[] = [
  // 회의: 답을 바로 고른다 (물어볼 의문 → 답의 2단 구조 없이). 안 풀린 의문의 아직 지워지지 않은 답만 보인다.
  {
    id: 'meeting',
    kind: 'vote',
    title: '회의',
    text: '한 바퀴를 돌고 나니 각자 아는 것이 다르다. 말로 맞춰 보고, 확신이 서는 의문이 있으면 그 답을 골라 걸어 본다.\n건 답은 그 자리에서 실제로 해 보게 되고, 틀리면 모두의 마음이 크게 흔들린다. 확신이 없으면 답을 걸지 않아도 된다.',
    choices: [
      // 엘리베이터
      { id: 'lift-press', text: '엘리베이터 — 층 버튼 하나를 눌러 본다', when: { all: [askable(QUESTIONS[0]), { not: { flag: 'no-lift-press' } }] }, next: 'lift-wrong-press' },
      { id: 'lift-mirror', text: '엘리베이터 — 거울을 똑바로 들여다본다', when: { all: [askable(QUESTIONS[0]), { not: { flag: 'no-lift-mirror' } }] }, next: 'lift-wrong-mirror' },
      { id: 'lift-still', text: '엘리베이터 — 아무것도 건드리지 않고 가만히 기다린다', when: askable(QUESTIONS[0]), next: 'lift-right' },
      // 소파
      ...SOFAS.map(([id, label]) => ({
        id: `sofa-${id}`,
        text: `소파 — ${label} 소파에 온기가 남아 있다`,
        when: { all: [askable(QUESTIONS[1]), { not: { flag: `no-sofa-${id}` } }] } as Cond,
        next: [{ when: { var: 'seat', is: id } as Cond, to: 'sofa-right' }, { to: `sofa-wrong-${id}` }],
      })),
      // 계단
      ...STAIRS.map((n) => ({
        id: `stairs-${n}`,
        text: `계단 — ${STAIR_STEPS[n]} 칸을 내려가면 끝에 닿는다`,
        when: { all: [askable(QUESTIONS[2]), { not: { flag: `no-stairs-${n}` } }] } as Cond,
        next: [{ when: { var: 'stairs', is: n } as Cond, to: 'stairs-right' }, { to: `stairs-wrong-${n}` }],
      })),
      { id: 'hold', text: '답을 걸지 않는다 — 더 조사한다', next: 'night' },
    ],
  },

  // 엘리베이터
  {
    id: 'lift-right',
    kind: 'story',
    title: '확정: 엘리베이터',
    text: '문 앞에서 한동안 가만히 기다렸다. 아무도 버튼을 누르지 않았고, 아무도 거울을 보지 않았다.\n문이 스스로 닫히려는 기척이 났다. 위로 올라가는 기척이다. 문틈에 발을 끼워 다시 열어 두었다.\n이 방법이 맞다. 나갈 때 그대로 하면 된다.',
    onEnter: [{ flag: 'solved-lift' }, { learn: 'panel-nobutton', to: 'all' }],
    next: 'night',
  },
  {
    id: 'lift-wrong-press',
    kind: 'story',
    title: '아니었다',
    text: '버튼에 불이 들어왔다. 엘리베이터는 한참을 내려가더니 같은 로비에 같은 소리로 문이 열렸다. 되돌아온 것이다.\n이 방법은 아니다. 일행 모두의 등줄기에 식은땀이 흘렀다.',
    onEnter: wrongGuess('no-lift-press', { learn: 'panel-press' }),
    next: 'night',
  },
  {
    id: 'lift-wrong-mirror',
    kind: 'story',
    title: '아니었다',
    text: '거울 속에서 일행을 한 명씩 세어 보았다. [[shake|하나가 더 있었다.]] 그 사람은 이쪽을 보고 있지 않았다.\n이 방법은 아니다. 눈을 돌린 뒤에도 한참 동안 시선이 따가웠다.',
    onEnter: wrongGuess('no-lift-mirror', { learn: 'mirror-extra' }),
    next: 'night',
  },

  // 소파
  {
    id: 'sofa-right',
    kind: 'story',
    title: '확정: 소파',
    text: SOFAS.map(([id, label]) => ({
      text: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n쿠션이 천천히 식어 갔다. 숨소리가 멎었다. 맞다. 온기가 남은 소파는 이쪽이다.`,
      when: { var: 'seat', is: id } as Cond,
    })),
    onEnter: [{ flag: 'solved-sofa' }, { learn: 'warm-seat', to: 'all' }],
    next: 'night',
  },
  ...SOFAS.map(([id, label]): Node => ({
    id: `sofa-wrong-${id}`,
    kind: 'story',
    title: '아니었다',
    text: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n그쪽은 [[cold|차가웠다.]] 말은 허공에 떨어졌고, 다른 쪽에서 무언가 일어서는 소리가 났다.\n이 소파는 아니다.`,
    onEnter: wrongGuess(`no-sofa-${id}`, { learn: `cold-${id}` }),
    next: 'night',
  })),

  // 계단
  {
    id: 'stairs-right',
    kind: 'story',
    title: '확정: 계단',
    text: '정해 둔 칸까지 내려가자 계단이 정말로 거기서 끝났다. 끝에는 로비와 똑같은 로비가 있었다.\n서둘러 계단을 되짚어 올라왔다. 센 숫자보다 하나 적게. 이 규칙을 기억해 둔다.',
    onEnter: [{ flag: 'solved-stairs' }, { learn: 'stairs-rule', to: 'all' }],
    next: 'night',
  },
  ...STAIRS.map((n): Node => ({
    id: `stairs-wrong-${n}`,
    kind: 'story',
    title: '아니었다',
    text: `${STAIR_STEPS[n]} 칸을 내려왔는데도 계단은 이어졌다. 발밑이 한 칸 사라지는 느낌에 서둘러 올라왔다.\n이 숫자가 아니다. 올라오는 동안 모두의 무릎이 후들거렸다.`,
    onEnter: wrongGuess(`no-stairs-${n}`),
    next: 'night',
  })),
]

/** 엘리베이터 앞에서 "그것"이 있는 소파에 정확히 말을 건 조합 */
const greetedRight: Cond = {
  any: SOFAS.map(([id]): Cond => ({ all: [{ var: 'seat', is: id }, { picked: `greet-${id}` }] })),
}

/** 소파 둘 이상에 동시에 말을 건 조합: 숨소리가 엉켜 한 명이 따라온다 (전부 찍어 보는 것을 막는다) */
const greetedMany: Cond = {
  any: [
    { all: [{ picked: 'greet-a' }, { picked: 'greet-b' }] },
    { all: [{ picked: 'greet-a' }, { picked: 'greet-c' }] },
    { all: [{ picked: 'greet-b' }, { picked: 'greet-c' }] },
  ],
}

export const b7Lobby: Scenario = {
  id: 'b7-lobby',
  code: 'A-02',
  name: 'B7 로비',
  type: 'place',
  party: { min: 2, max: 4 },
  map: { x: 44, y: 66 },
  blurb: '도면에 없는 지하 7층. 엘리베이터가 층 표시 없이 멈추면 카펫이 깔린 작은 로비가 나온다.',
  summary: '지하 6층 아래, 도면에 없는 층. 엘리베이터 문이 열리면 카펫이 깔린 작은 로비가 나온다. 조명은 일정한 간격으로 어두워진다.',
  observation: [
    '엘리베이터가 층 표시 없이 멈추면 B7이다. 도면에는 B6까지만 있다.',
    '로비에는 접수대, 소파 세 개, 아래로 내려가는 계단 하나가 있다.',
    '조명은 7분 간격으로 한 단계씩 어두워지고, 마지막 단계는 암전이다.',
  ],
  manual: [
    '엘리베이터에서 내린 뒤 문이 닫히는 소리를 확인한다.',
    '전화는 받아도 된다. 다만 거짓으로 대답하지 않는다.',
    '소파에는 앉지 않는다.',
    '(이하 내용은 종이가 찢겨 없다.)',
  ],
  dossier: [
    {
      id: 'found',
      title: '발견 경위',
      lines: [
        'B6 설비 점검 중 엘리베이터가 층 표시 없이 한 번 더 내려갔다는 보고가 접수되었다. 도면에는 B6까지만 있다.',
        '점검자는 카펫이 깔린 로비에서 "아주 오래된 호텔 같았다"고 했고, 돌아온 뒤 일행 수를 몇 번이고 다시 세었다.',
      ],
    },
    {
      id: 'light',
      title: '조명',
      lines: [
        '조명은 7분 간격으로 한 단계씩 어두워진다. 마지막 단계는 암전이고, 암전 뒤에 로비는 "센다".',
        '암전에서 돌아온 점검자들은 모두 일행이 한 명 늘었다고 주장했다.',
      ],
      unlock: { hint: 'light-cycle' },
    },
    {
      id: 'guestbook',
      title: '방명록',
      lines: [
        '방명록의 모든 서명은 날짜가 같다. 서명한 직원 중 일부는 현재 시설 명부에 없다.',
        '명부에 없는 사람들의 필체가 서로 닮아 가고 있다. 마지막 서명은 항상 잉크가 마르지 않았다.',
      ],
      unlock: { hint: 'book-date' },
    },
    {
      id: 'elevator',
      title: '엘리베이터',
      lines: [
        '버튼을 누르는 것은 이미 있는 층을 고르는 일이라서, 누르면 엘리베이터는 있는 층(B7)으로 되돌아온다.',
        '아무것도 누르지 않고 기다리면 "있어야 할 층"으로 올라간다. 안쪽 거울은 보지 않는다.',
      ],
      unlock: { hint: 'panel-nobutton' },
    },
    {
      id: 'stairs',
      title: '계단의 셈',
      lines: [
        '계단은 세는 사람의 수만큼 길어진다. 센 숫자보다 하나 적게 내려가야 끝이 있다.',
        '끝에는 로비와 똑같은 로비가 있다. 다만 소파가 하나 적다.',
      ],
      unlock: { hint: 'stairs-rule' },
    },
    {
      id: 'sofa',
      title: '소파',
      lines: [
        '소파 세 개 가운데 하나에는 늘 누군가 앉아 있었던 온기가 남아 있다. 그것은 일행이 올 때마다 한 명 더 앉아 있다.',
        '그 소파에 "여기 계세요"라고 말해 주면 그것은 일어나지 않는다. 여러 소파에 한꺼번에 말을 걸면 숨소리가 엉켜 오히려 따라온다.',
      ],
      unlock: { hint: 'greet-rule' },
    },
    {
      id: 'phone',
      title: '접수대 전화',
      lines: [
        '전화는 조명이 어두워진 뒤부터 울린다. 받으면 인원수를 묻고, 대답을 방명록에 적는다.',
        '거짓으로 대답한 직원은 다음 서명에 이름이 한 줄 더 늘어 있었다.',
      ],
      unlock: { hint: 'phone-count' },
    },
  ],
  items: [{ id: 'torch', name: '청동 손전등', text: '빛이 닿는 곳은 계단이 계단처럼 보인다.' }],
  facts: [
    { id: 'light-cycle', text: '조명은 7분마다 한 단계씩 어두워진다. 마지막 단계는 암전이다.' },
    { id: 'door-closed', text: '엘리베이터 패널에는 올라가는 버튼이 없다. 내려가는 층 버튼만 있다.' },
    { id: 'sofa-dent', text: '소파 세 개 중 하나만 쿠션이 방금 눌린 모양이다.' },
    { id: 'book-date', text: '방명록의 모든 서명은 날짜가 같다.' },
    { id: 'book-ink', text: '방명록의 마지막 서명은 잉크가 마르지 않았고, 필체가 일행 중 한 명과 닮았다.' },
    { id: 'panel-press', text: '층 버튼을 누르면 엘리베이터는 다시 B7로 되돌아온다.' },
    { id: 'panel-nobutton', text: '아무 버튼도 누르지 않고 기다리면 엘리베이터가 올라간다.' },
    { id: 'mirror-extra', text: '엘리베이터 거울에는 일행보다 한 명이 더 비친다.' },
    { id: 'stairs-count', text: '난간 기둥의 수를 세어 두었다.' },
    { id: 'stairs-rule', text: '계단은 센 숫자보다 하나 적게 내려가야 한다.' },
    { id: 'warm-seat', text: '소파 중 한 곳에 온기가 남아 있다.' },
    { id: 'greet-rule', text: '온기가 남은 소파에 "여기 계세요"라고 말해 주면 그것은 따라오지 않는다. 단, 한 곳에만 말해야 한다.' },
    { id: 'phone-count', text: '전화는 인원수를 묻고, 대답을 방명록에 적는다.' },
    { id: 'extra-voice', text: '인원을 소리 내어 세면 어디선가 한 명이 더 대답한다.' },
    { id: 'extra-returns', text: '발소리는 소파에서 시작해 소파로 돌아간다.' },
    // 판마다 바뀌는 값에 대한 사실 (조사 보드에만 붙고 단서 노트에는 남지 않는다)
    ...SOFAS.flatMap(([id, label]) => [
      { id: `warm-${id}`, text: `${label} 소파에는 온기가 남아 있다.`, run: true },
      { id: `cold-${id}`, text: `${label} 소파는 차갑다.`, run: true },
    ]),
    ...STAIRS.map((n) => ({ id: `rail-${n}`, text: `난간 기둥은 ${n}개다. (손전등으로 비춰 센 것이라 정확하다)`, run: true })),
    { id: 'rail-near10', text: '난간 기둥은 열 개 안팎이다. (어둠 속에서 더듬어 센 것이라 정확하지 않다 — 아홉이거나 열하나)', run: true },
    { id: 'rail-over12', text: '난간 기둥은 열두 개를 훌쩍 넘는다. (어둠 속에서 더듬어 센 것이라 정확하지는 않다)', run: true },
  ],
  board: {
    goal: '조명이 완전히 꺼지기 전에, 일행 모두가 이 층을 무사히 벗어날 방법을 찾아낸다.',
    questions: [
      {
        id: 'lift',
        text: '엘리베이터를 어떻게 타야 위로 올라가는가?',
        facts: LIFT_FACTS,
        solved: { flag: 'solved-lift' },
        answer: '아무 버튼도 누르지 않고, 거울도 보지 않은 채 가만히 기다린다.',
      },
      {
        id: 'sofa',
        text: '온기가 남은 소파는 어느 쪽인가?',
        facts: SOFA_FACTS,
        solved: { flag: 'solved-sofa' },
        answer: SOFAS.map(([id, label]) => ({ text: `${label} 소파다.`, when: { var: 'seat', is: id } as Cond })),
      },
      {
        id: 'stairs',
        text: '계단은 몇 칸을 내려가야 끝에 닿는가?',
        facts: STAIRS_FACTS,
        solved: { flag: 'solved-stairs' },
        answer: STAIRS.map((n) => ({ text: `${STAIR_STEPS[n]} 칸이다. (센 숫자보다 하나 적게)`, when: { var: 'stairs', is: n } as Cond })),
      },
    ],
  },
  vars: [
    { id: 'seat', pick: ['a', 'b', 'c'] },
    { id: 'stairs', pick: [...STAIRS] },
  ],
  clock: { labels: ['도착', '조명 한 단계', '조명 두 단계', '조명 세 단계', '조명 네 단계', '암전'] },
  deadline: { time: 5, node: 'blackout-end' },
  onAllPanic: 'collapse-end',
  start: 'arrive',
  nodes: [
    // ───────────────────────── 도착 ─────────────────────────
    {
      id: 'arrive',
      period: 'day',
      kind: 'story',
      title: '도착',
      text: '엘리베이터가 층 표시 없이 멈췄다. 문이 열리자 은은한 조명 아래 카펫이 깔린 작은 로비가 나타났다. 접수대, 소파 세 개, 그리고 아래로 내려가는 계단. 뒤에서 문이 [[whisper|조용히]] 닫혔다.',
      next: 'first-look',
    },
    {
      id: 'first-look',
      kind: 'personal',
      title: '첫 인상',
      text: '로비는 조용하다. 각자 먼저 눈에 들어오는 곳을 살핀다.',
      options: [
        {
          id: 'desk',
          text: '접수대부터 살핀다',
          result: '접수대로 걸어가 방명록을 내려다본다. 두꺼운 종이는 오래된 호텔의 것처럼 누렇게 바랬는데, 펜 자국만은 이상하리만치 선명하다.\n접수대 위에 방명록이 펼쳐져 있다. 서명은 수십 줄인데 날짜 칸이 모두 같은 날이다. 마치 한자리에서 한꺼번에 적은 것처럼.',
          effects: [{ learn: 'book-date', to: 'actor' }],
        },
        {
          id: 'lights',
          text: '천장 조명을 올려다본다',
          result: '고개를 들어 천장을 올려다본다. 조명은 숨을 쉬듯 느릿하게 흐려졌다가, 한참 지나서야 제 밝기로 돌아온다.\n[[flicker|조명이 천천히 반 칸 어두워지더니]], 한참 뒤에 다시 돌아왔다. 일정한 간격이 있는 것 같다. 아마 7분. 그 간격의 끝에 무엇이 있는지는 아직 모른다.',
          effects: [{ learn: 'light-cycle', to: 'actor' }],
        },
        {
          id: 'door',
          text: '돌아서서 엘리베이터 패널을 본다',
          result: '돌아서서 엘리베이터 패널 앞에 선다. 닫힌 문은 거울처럼 매끈해서 일행의 뒷모습이 흐릿하게 비친다.\n패널에는 층 버튼이 여섯 개뿐이다. B1부터 B6까지. 올라가는 버튼은 없다. 우리는 어떻게 이 층에 내려왔을까, 하는 생각이 불쑥 든다.',
          effects: [{ learn: 'door-closed', to: 'actor' }],
        },
        {
          id: 'sofas',
          text: '소파들을 둘러본다',
          when: insight3,
          result: '소파들을 천천히 둘러본다. 같은 천, 같은 간격, 같은 방향.\n소파 세 개가 같은 방향을 보고 있다. 그중 하나의 쿠션만 방금 눌린 것처럼 모양이 남아 있다. 누군가 막 일어난 자리 같다.',
          effects: [{ learn: 'sofa-dent', to: 'actor' }],
        },
        {
          id: 'sofas-plain',
          text: '소파들을 둘러본다',
          when: { not: insight3 },
          result: '소파들을 천천히 둘러본다. 같은 천, 같은 간격, 같은 방향.\n소파 세 개가 나란히 놓여 있다. 오래되었지만 먼지는 없다. 누군가 매일 닦아 두는 것처럼.',
        },
      ],
      next: 'survey',
    },

    // ───────────────────────── 낮: 조사 ─────────────────────────
    {
      id: 'survey',
      period: 'day',
      kind: 'split',
      title: '로비 조사',
      text: [
        { text: '로비는 은은한 조명 아래 조용하다. 접수대, 소파 세 개, 아래로 내려가는 계단, 그리고 닫힌 엘리베이터. 각자 다른 곳을 맡는다.', when: { time: { max: 0 } } },
        { text: '조명이 한 단계 어두워졌다. 소파의 윤곽이 흐려졌고, 접수대 쪽에서 낮은 벨소리가 들리는 듯하다.', when: { time: { min: 1, max: 1 } } },
        { text: '조명이 두 단계 어두워졌다. 소파 위로 그림자가 길게 늘어졌다.', when: { time: { min: 2, max: 2 } } },
        { text: '[[flicker|조명이 거의 꺼질 듯 깜빡인다.]] 가장자리가 보이지 않는다.', when: { time: { min: 3 } } },
        { text: '[[whisper|(눈이 침침하다. 글자가 번져 보인다.)]]', when: { stat: 'sanity', max: 3, by: 'me' } },
      ],
      actions: [
        { id: 'book', text: '접수대의 방명록을 처음부터 읽는다', max: 1, ...seenGate('book') },
        ...SOFAS.map(([id, label]) => ({
          id: `sofa-${id}`,
          text: `${label} 소파를 만져 보고 앉았던 자국을 살핀다`,
          max: 1,
          ...seenGate(`sofa-${id}`),
        })),
        { id: 'panel', text: '엘리베이터 층 패널을 자세히 살핀다', max: 1, ...seenGate('panel') },
        { id: 'rail', text: '계단 난간 기둥을 하나씩 센다', max: 1, needsHealthy: true, when: { not: { flag: 'seen-rail' } } as Cond, locked: '이미 살펴봤거나, 다친 몸으로는 어두운 계단 입구에 서기 어렵다' },
        { id: 'phone', text: '접수대 전화기 곁에서 기다린다', max: 1, when: { time: { min: 1 } }, locked: '아직 전화는 울리지 않는다' },
        { id: 'rest', text: '소파 뒤에 앉아 숨을 고른다', calming: true },
      ],
      private: withSeen([
        // 방명록: 관찰이 높으면 마지막 서명의 이상함까지 알아본다
        {
          action: 'book',
          when: insight3,
          text: '서명은 모두 같은 날짜다. 마지막 줄만 잉크가 마르지 않았다. 필체는 일행 중 누군가와 놀랍도록 닮았다. 이름은 읽을 수 없게 번져 있다.',
          effects: [
            { learn: 'book-date', to: 'actor' },
            { learn: 'book-ink', to: 'actor' },
          ],
        },
        {
          action: 'book',
          text: '서명 수십 줄, 날짜는 모두 같은 날이다. 마지막 서명은 아직 반짝일 만큼 새것처럼 보인다.',
          effects: [{ learn: 'book-date', to: 'actor' }],
        },
        // 소파: 한 곳만 따뜻하다 (판마다 다른 자리). 관찰이 높으면 쪽지까지 발견.
        ...SOFAS.flatMap(([id, label]) => [
          {
            action: `sofa-${id}`,
            when: { all: [{ var: 'seat', is: id }, insight3] } as Cond,
            text: `${label} 소파는 방금까지 누가 앉았던 것처럼 따뜻하다. 쿠션 틈에 쪽지가 끼어 있다. “여기 계세요, 라고 한 곳에만 말해 주세요. 그러면 따라가지 않습니다.”`,
            effects: [
              { learn: 'warm-seat' as const, to: 'actor' as const },
              { learn: `warm-${id}`, to: 'actor' as const },
              { learn: 'greet-rule' as const, to: 'actor' as const },
            ],
            later: [{ stat: 'sanity' as const, add: -1, to: 'actor' as const }],
          },
          {
            action: `sofa-${id}`,
            when: { var: 'seat', is: id } as Cond,
            text: `${label} 소파는 방금까지 누가 앉았던 것처럼 따뜻하다. 손을 떼자 쿠션이 천천히 부풀어 올랐다.`,
            effects: [
              { learn: 'warm-seat' as const, to: 'actor' as const },
              { learn: `warm-${id}`, to: 'actor' as const },
            ],
            later: [{ stat: 'sanity' as const, add: -1, to: 'actor' as const }],
          },
          {
            action: `sofa-${id}`,
            text: `${label} 소파는 차갑다. 쿠션이 굳어 있고 앉은 자국이 없다.`,
            effects: [{ learn: `cold-${id}`, to: 'actor' as const }],
          },
        ]),
        // 패널: 관찰이 높으면 낙서 아래의 작은 글씨까지
        {
          action: 'panel',
          when: insight3,
          text: '층 버튼에는 눌러 본 흔적이 가득하다. 패널 아래 낙서가 있다. “누르면 돌아온다.” 그 아래 더 작은 글씨. “아무것도 누르지 않은 사람만 올라간다.”',
          effects: [
            { learn: 'panel-press', to: 'actor' },
            { learn: 'panel-nobutton', to: 'actor' },
          ],
        },
        {
          action: 'panel',
          text: '층 버튼에는 눌러 본 흔적이 가득하다. 패널 아래 낙서가 있다. “누르면 돌아온다.”',
          effects: [{ learn: 'panel-press', to: 'actor' }],
        },
        // 난간: 손전등이 있으면 대가 없이, 없으면 정신력을 조금 쓴다 (값은 같다)
        ...STAIRS.flatMap((n) => [
          {
            action: 'rail',
            when: { all: [{ item: 'torch', by: 'actor' }, { var: 'stairs', is: n }] } as Cond,
            text: '손전등으로 비추며 난간 기둥을 하나씩 세었다. 모두 {stairs}개다. 틀림없다.',
            effects: [
              { learn: 'stairs-count' as const, to: 'actor' as const },
              { learn: `rail-${n}`, to: 'actor' as const },
            ],
          },
          {
            action: 'rail',
            when: { var: 'stairs', is: n } as Cond,
            text:
              n === 13
                ? '어둠 속에서 손으로 더듬으며 난간 기둥을 셌다. 열두 개를 훌쩍 넘었다. 손끝이 떨려서 정확하지는 않다.'
                : '어둠 속에서 손으로 더듬으며 난간 기둥을 셌다. 열 개 안팎이다. 손끝이 떨려서 정확하지는 않다.',
            effects: [
              { learn: 'stairs-count' as const, to: 'actor' as const },
              { learn: n === 13 ? 'rail-over12' : 'rail-near10', to: 'actor' as const },
            ],
            later: [{ stat: 'sanity' as const, add: -1, to: 'actor' as const }],
          },
        ]),
        { action: 'rest', text: '소파 뒤에서 숨을 골랐다. 마음이 조금 가라앉았다.', effects: [{ stat: 'sanity', add: 2, to: 'actor' }, { heal: 'actor' }] },
      ]),
      outcomes: [
        {
          when: { picked: 'phone' },
          text: '그때, 접수대에서 전화벨이 울리기 시작했다.\n낮고 느린 벨소리가 빈 로비를 한 바퀴 돌아 나왔다. 아무도 건드린 적 없는 수화기가 가볍게 떨렸다.',
          effects: [{ time: 1 }],
          next: 'phone-call',
        },
        {
          text: '각자 맡은 곳을 한 바퀴 돌아보고 접수대 앞으로 모였다. 조명이 한 단계 더 어두워졌다.\n돌아온 사람들의 얼굴이 아까보다 한 톤 가라앉아 보였다. 서로 본 것을 말하기도 전에, 로비가 먼저 조용해졌다.',
          effects: [{ time: 1 }],
          next: TO_MEETING,
        },
      ],
    },

    // ───────────────────────── 전화 ─────────────────────────
    {
      id: 'phone-call',
      kind: 'vote',
      title: '접수대 전화',
      text: '수화기를 들자 숨 쉬는 소리가 들리더니, 정중한 목소리가 물었다. [[whisper|“거기, 몇 분이세요?”]] 일행이 서로를 바라보았다.',
      choices: [
        {
          id: 'truth',
          text: '“{players}명입니다.”',
          result: '수화기 너머가 잠시 조용해졌다. 누군가 사람 수를 하나씩 맞춰 보는 듯한 침묵이었다.\n[[whisper|“…확인했습니다.”]]\n방명록의 어느 한 줄이 펜도 닿지 않은 채 조용히 지워졌다. 전화가 끊기기 전에 목소리가 한마디를 덧붙였다. “소파의 손님께는 한 곳에만 인사를 해 주세요. 여기 계시라고.”',
          effects: [{ flag: 'counted' }, { learn: 'phone-count', to: 'all' }, { learn: 'greet-rule', to: 'all' }],
          next: TO_MEETING,
        },
        {
          id: 'plus-one',
          text: '“한 명 더 있어요.”',
          result: '말이 입 밖으로 나가자마자 후회가 밀려왔다. 수화기 너머에서 만족스러운 숨이 새어 나왔다.\n[[loud|“그럼 그분도 함께 모시겠습니다.”]]\n소파 쪽에서 누군가 천천히 일어나는 소리가 났다. 아무도 그쪽을 돌아보지 못했다.',
          effects: [{ flag: 'invited' }, { learn: 'phone-count', to: 'all' }],
          later: [{ stat: 'sanity', add: -2, to: 'all' }],
          next: TO_MEETING,
        },
        {
          id: 'hang-up',
          text: '아무 말 없이 수화기를 내려놓는다',
          result: '수화기를 내려놓는 손이 생각보다 무거웠다. 딸깍, 하는 소리가 로비 구석구석까지 울렸다.\n전화는 곧 다시 울렸지만, 누구도 받지 않았다. 한동안 벨소리가 벽에서 벽으로 돌아다녔다. 그러다 어느 순간 벨이 멎었고, 멎은 자리에 정적이 더 두껍게 고였다.',
          next: TO_MEETING,
        },
      ],
    },

    // ───────────────────────── 회의 ─────────────────────────
    ...MEETING_NODES,

    // ───────────────────────── 밤: 개인 활동 ─────────────────────────
    {
      id: 'night',
      period: 'night',
      kind: 'personal',
      title: '로비의 밤',
      text: [
        { text: '조명이 낮아진 로비는 낮과 다르다. 각자 흩어져 각자의 일을 한다.' },
        { text: '[[whisper|(귀에서 낮은 소리가 계속 맴돈다.)]]', when: { stat: 'sanity', max: 3, by: 'me' } },
      ],
      options: [
        {
          id: 'train-body',
          text: '계단 입구에서 몸을 풀고 단련한다',
          result: '계단 입구의 차가운 난간을 붙잡고 몸을 풀기 시작했다. 아래의 어둠을 곁눈질하며 팔을 돌리고, 무릎을 굽혔다 폈다.\n밤새 몸을 움직였다. 다리에 힘이 돌아왔다. 숨이 가쁜 동안만큼은 이상하게 아무 생각도 나지 않았다.',
          effects: [{ stat: 'body', add: 1, to: 'actor' }],
        },
        {
          id: 'study',
          text: '방명록과 낙서를 다시 읽으며 머릿속을 정리한다',
          result: '방명록을 무릎 위에 펼치고 낙서를 한 글자씩 짚어 읽었다. 읽은 줄을 다시 읽고, 또 읽었다.\n같은 줄을 몇 번이고 읽었다. 글자 사이의 빈틈이 보이기 시작한다. 빈틈에는 어떤 규칙이 있는 것 같았다.',
          effects: [{ stat: 'insight', add: 1, to: 'actor' }],
        },
        {
          id: 'rest',
          text: '소파에서 먼 구석에 앉아 마음을 가라앉힌다',
          calming: true,
          result: '소파에서 가장 먼 구석에 등을 붙이고 앉았다. 눈을 감고 들숨과 날숨을 천천히 셌다. 이번에는 사람 수가 아니라 숨만 셌다.\n숨을 골랐다. 마음이 가라앉았고 몸의 통증도 조금 풀렸다.',
          effects: [{ stat: 'sanity', add: 3, to: 'actor' }, { heal: 'actor' }],
        },
        {
          id: 'coin',
          text: '소파 틈새와 카펫 가장자리를 훑어 잃어버린 물건을 찾는다',
          result: '소파 틈새와 카펫 가장자리를 손끝으로 훑었다. 먼지 한 톨 없는 로비에서 잃어버린 것을 찾는 일은 이상하게 쉽지 않았다.\n그러다 소파 틈새에서 낡은 동전 하나가 나왔다. 손에 쥐자 이상하게 마음이 놓였다. 오늘은 일이 잘 풀릴 것 같다.',
          effects: [{ stat: 'luck', add: 1, to: 'actor' }],
        },
        {
          id: 'drawer',
          text: '접수대 서랍을 조심스럽게 뒤져 본다',
          when: { stat: 'luck', min: 3, by: 'actor' },
          locked: '운이 따라야 찾을 수 있을 것 같다',
          result: '접수대 안쪽으로 손을 넣어 서랍을 조심스레 열었다. 종이 클립과 닳은 연필 사이로 묵직한 것이 손끝에 걸렸다.\n서랍 맨 안쪽에서 청동 손전등을 찾았다. 아직 따뜻하다. 방금까지 누군가 쥐고 있었던 것처럼.',
          effects: [{ give: 'torch', to: 'actor' }],
        },
        {
          id: 'elevator-peek',
          text: '혼자 엘리베이터 앞으로 가 본다',
          then: 'el-1',
        },
        {
          id: 'stairs-peek',
          text: '혼자 계단 위에서 아래의 소리를 들어 본다',
          then: 'st-1',
        },
      ],
      steps: [
        {
          id: 'el-1',
          text: '혼자 엘리베이터 앞으로 걸어갔다. 일행의 목소리가 등 뒤에서 점점 멀어졌다.\n엘리베이터 문은 열려 있다. 층 표시등은 B6에서 멈춰 있고, 안쪽 거울에는 일행이 비친다. 어딘가 하나가 더 많은 것 같다.',
          choices: [
            {
              id: 'wait-door',
              text: '아무것도 건드리지 않고 문 앞에서 가만히 기다린다',
              result: '아무것도 건드리지 않고 문 앞에 가만히 섰다. 숨소리조차 조심스러웠다.\n한참 뒤 문이 스스로 닫히려 했다. 버튼을 누른 적이 없는데도, 위로 올라가는 기척이 났다. 문틈에 발을 끼워 다시 열어 두었다. 기척은 한동안 문 안쪽에서 기다리다 가라앉았다.',
              effects: [{ learn: 'panel-nobutton', to: 'actor' }],
            },
            {
              id: 'press-one',
              text: '층 버튼 하나를 눌러 본다',
              result: '손가락이 닿은 버튼에 불이 들어왔다. 문이 닫히고, 바닥이 가라앉는 느낌이 한참 이어졌다.\n엘리베이터가 한참을 내려가더니, 같은 로비에 같은 소리로 문이 열렸다. 되돌아온 것이다. 같은 카펫, 같은 소파, 그리고 같은 정적.',
              effects: [{ learn: 'panel-press', to: 'actor' }],
              later: [{ stat: 'sanity', add: -2, to: 'actor' }],
            },
            {
              id: 'look-mirror',
              text: '거울을 똑바로 들여다본다',
              result: '거울 속의 일행을 가만히 들여다보았다. 눈을 맞추지 않으려 애쓰면서, 한 명씩 손가락으로 세었다.\n거울 속에서 일행을 한 명씩 세어 보았다. [[shake|하나가 더 있었다.]] 그 사람은 이쪽을 보고 있지 않았다. 아주 오래전부터 거기 서 있었던 사람처럼.',
              effects: [{ learn: 'mirror-extra', to: 'actor' }],
              later: [{ stat: 'sanity', add: -2, to: 'actor' }],
            },
            { id: 'leave', text: '아무것도 하지 않고 돌아선다', result: '아무것도 하지 않은 채 발길을 돌렸다. 등 뒤에서 문이 천천히 닫히는 소리가 났다. 돌아보지 않는 편이 낫다는 확신이 들었다.' },
          ],
        },
        {
          id: 'st-1',
          text: '혼자 계단 입구로 걸어가 난간에 손을 얹었다. 금속이 이상하리만치 미지근했다.\n계단 아래는 어둠이다. 아래에서 누군가 천천히 숫자를 센다. [[whisper|하나… 둘… 셋…]] 한 번도 서두르지 않는다.',
          choices: [
            {
              id: 'count-along',
              text: '소리 내어 함께 센다',
              result: '낮은 목소리로 아래의 숫자를 따라 센다. 하나, 둘, 셋. 입술이 말라 가는데도 멈출 수 없었다.\n숫자가 한 칸 모자란 곳에서 소리가 멎었다. 마지막 칸을 세기 전에 계단이 끝난 것이다. 그 빈칸이 잠시 이쪽을 바라보는 느낌이 들었다.',
              effects: [{ learn: 'stairs-rule', to: 'actor' }],
              later: [{ stat: 'sanity', add: -2, to: 'actor' }],
            },
            {
              id: 'listen-pattern',
              text: '숨을 죽이고 소리의 간격만 가만히 듣는다',
              when: insight3,
              locked: '소리의 박자를 가려낼 만큼 귀가 밝지 않다',
              result: '숨을 죽이고 소리의 간격에만 귀를 모은다. 숫자 하나하나가 아니라, 숫자와 숫자 사이의 쉼표를.\n숫자는 매번 마지막 한 칸을 건너뛰고 멎는다. 센 수보다 하나 적은 곳에서. 처음부터 그렇게 정해져 있었다는 듯이.',
              effects: [{ learn: 'stairs-rule', to: 'actor' }],
            },
            { id: 'back', text: '더 듣지 않고 물러난다', result: '더 듣지 않고 한 걸음, 두 걸음 물러났다. 소리는 한동안 따라오다가 멀어졌다. 귓가에는 아직 센 숫자가 맴돈다.' },
          ],
        },
      ],
      // 조사 라운드는 인원과 상관없이 두 번이다. 한 곳은 한 번만 살필 수 있고 곳이 칸보다 많아서, 무엇을 볼지 골라야 한다.
      // (2명은 칸이 4개, 4명은 8개지만 4명은 같은 시간에 같은 단서를 더 나눠 가진다 — 사람이 많을수록 말로 맞춰야 할 것이 늘어난다.)
      next: [
        { when: { time: { min: 2 } }, to: 'gather' },
        { when: { all: [{ not: { flag: 'footsteps' } }, { time: { min: 1, max: 1 } }] }, to: 'event-footsteps' },
        { to: 'survey' },
      ],
    },

    // ───────────────────────── 사건: 발소리 ─────────────────────────
    {
      id: 'event-footsteps',
      period: 'night',
      kind: 'vote',
      title: '발소리',
      text: '소파 쪽에서 발소리가 났다. 소파에서 접수대로, 접수대에서 엘리베이터 쪽으로. 발소리는 일행 곁을 지나며 한 사람씩 세는 것처럼 멈칫했다.',
      choices: [
        {
          id: 'follow',
          text: '소리를 따라가며 어디서 시작하는지 본다',
          result: '발소리를 한 걸음 뒤에서 따라갔다. 카펫에는 발자국이 생기지 않는데도, 소리는 분명한 간격으로 이어졌다.\n발소리는 소파에서 시작해 소파로 돌아간다. 따라가던 사람의 목덜미가 서늘했다. 그것은 처음부터 어디로도 가지 않았다.',
          effects: [{ flag: 'footsteps' }, { learn: 'extra-returns', to: 'all' }],
          later: [{ stat: 'sanity', add: -2, to: 'all' }],
          next: 'survey',
        },
        {
          id: 'quiet',
          text: '숨을 죽이고 가만히 있는다',
          result: '숨을 죽이고 서로의 어깨가 닿을 만큼 가까이 모였다. 심장 소리가 커서 발소리와 구별이 되지 않았다.\n발소리는 한참 일행 곁에 머물다가 멀어졌다. 아무 일도 없었다. 그래서 더 불안했다.',
          effects: [{ flag: 'footsteps' }],
          next: 'survey',
        },
        {
          id: 'count-aloud',
          text: '소리 내어 “하나, 둘, …” 인원을 센다',
          result: '누군가 용기를 내어 “하나”라고 입을 뗐다. 한 명씩 차례로 이어서 세어 나갔다.\n일행이 한 명씩 세는 소리 뒤에, 어디선가 한 명이 더 [[shake|“…셋”]]이라고 대답했다. 발소리가 멎었다. 그것은 만족한 듯 조용했다.',
          effects: [{ flag: 'footsteps' }, { flag: 'invited' }, { learn: 'extra-voice', to: 'all' }],
          later: [{ stat: 'sanity', add: -1, to: 'all' }],
          next: 'survey',
        },
      ],
    },

    // ───────────────────────── 결정 ─────────────────────────
    {
      id: 'gather',
      kind: 'vote',
      title: '이제 어디로',
      text: [
        { text: '조명이 거의 꺼져 간다. 더 조사할 시간은 많지 않다. 이제 이 로비를 떠날 길을 골라야 한다.' },
        { text: '접수대의 방명록이 저절로 한 장 넘어갔다.', when: { flag: 'invited' } },
      ],
      choices: [
        {
          id: 'elevator',
          text: '엘리베이터로 올라간다',
          result: '엘리베이터 쪽으로 몸을 돌렸다. 마지막 조명이 깜빡이는 사이, 문은 열린 채 일행을 기다리고 있었다.',
          next: 'lift',
        },
        {
          id: 'stairs',
          text: '계단으로 내려가 본다',
          result: '난간을 붙잡고 계단 입구에 모여 섰다. 아래의 어둠이 한 칸씩 숨을 쉬는 것처럼 보였다.',
          next: 'stairs-vote',
        },
        {
          id: 'sign',
          text: '방명록에 서명하고 얌전히 기다린다',
          result: '접수대 위에 펜이 놓여 있었다. 누가 먼저 쥐었는지 모르게, 손들이 방명록으로 향했다.',
          next: 'sign-story',
        },
        {
          id: 'wait',
          text: '조금 더 조사한다',
          result: '결정을 미루자 조명이 한 단계 더 어두워졌다.\n서로의 얼굴이 조금씩 흐려졌다. 아직 시간이 있다고, 누구도 확신하지 못한 채 각자의 자리로 흩어졌다.',
          effects: [{ time: 1 }],
          next: 'survey',
        },
      ],
    },

    // ───────────────────────── 엘리베이터 ─────────────────────────
    {
      id: 'lift',
      kind: 'split',
      title: '엘리베이터 앞',
      text: '엘리베이터 문이 열려 있다. 안쪽 거울에 일행의 모습이 비친다. 소파 쪽에서 낮은 숨소리가 들린다. 문이 닫히기 전에 각자 무엇을 할지 정해야 한다.',
      actions: [
        { id: 'still', text: '가만히 서서 문이 닫히기를 기다린다' },
        { id: 'press', text: '아무 층이나 버튼을 눌러 본다' },
        { id: 'mirror', text: '거울을 들여다본다' },
        ...SOFAS.map(([id, label]) => ({
          id: `greet-${id}`,
          text: `${label} 소파에 대고 “여기 계세요”라고 말해 둔다`,
          max: 1,
        })),
      ],
      private: SOFAS.flatMap(([id, label]) => [
        {
          action: `greet-${id}`,
          when: { var: 'seat', is: id } as Cond,
          text: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n${label} 소파가 조용히 가라앉았다. 숨소리가 멎고, 쿠션이 천천히 식어 갔다.`,
        },
        {
          action: `greet-${id}`,
          text: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n${label} 소파는 차가웠다. 말은 허공에 떨어졌고, 다른 쪽에서 무언가 일어서는 소리가 났다.`,
          later: [{ stat: 'sanity' as const, add: -2, to: 'actor' as const }],
        },
      ]),
      outcomes: [
        { when: { picked: 'press' }, effects: [], later: [{ stat: 'sanity', add: -2, to: 'all' }, { hurt: { picked: 'press' } }], next: 'press-fail' },
        { when: { picked: 'mirror' }, next: 'mirror-story' },
        {
          when: greetedMany,
          text: '여러 소파에 동시에 말을 걸자 숨소리들이 서로 엉켰다. 어느 쪽이 대답하는지 알 수 없게 되었다.',
          next: 'ascend-follow',
        },
        {
          when: { all: [greetedRight, { flag: 'counted' }, { not: { flag: 'invited' } }] },
          next: 'ascend-true',
        },
        { when: { all: [greetedRight, { not: { flag: 'invited' } }] }, next: 'ascend-good' },
        { next: 'ascend-follow' },
      ],
    },
    {
      id: 'press-fail',
      kind: 'story',
      title: '되돌아온 로비',
      text: '누군가 버튼을 눌렀다. 불이 들어온 숫자를 모두가 보았다.\n문이 닫히고 엘리베이터는 한참을 내려가더니, 같은 로비에 같은 소리로 문이 열렸다. 문이 닫히는 순간 버튼을 누른 사람의 팔이 문틈에 끼었다.\n비명은 짧았다. 로비는 아무 일도 없었다는 듯 같은 조도로 일행을 맞았다.',
      next: 'gather',
    },
    {
      id: 'mirror-story',
      kind: 'story',
      title: '거울 속',
      text: '거울 속에서 한 사람이 천천히 이쪽으로 걸어 나왔다. [[whisper|유리를 넘는 소리는 나지 않았다.]]\n그는 일행 사이에 서서 아무 일도 없었다는 듯 같은 방향을 바라보았다. 문이 닫혔다.\n올라가는 내내 아무도 서로의 얼굴을 쳐다보지 못했다.',
      next: 'followed-end',
    },
    {
      id: 'ascend-follow',
      kind: 'story',
      title: '올라가는 길',
      text: '문이 닫히고 엘리베이터가 위로 움직였다. 소파 쪽에서 마지막으로 무언가 일어서는 소리가 났다.\n올라가는 내내 숨소리가 하나 더 많았다. 문이 열렸을 때 누구도 일행의 수를 세지 않았다.',
      next: 'followed-end',
    },
    {
      id: 'ascend-good',
      kind: 'story',
      title: '올라가는 길',
      text: '문이 닫히고 엘리베이터가 위로 움직였다. 소파 쪽의 숨소리는 더 따라오지 않았다.\n올라가는 내내 접수대 전화가 멀리서 울리는 것 같았다. 아무도 받지 않았다. 모두 어깨의 힘을 풀지 못한 채 숫자가 바뀌는 것만 바라보았다.',
      next: 'quiet-end',
    },
    {
      id: 'ascend-true',
      kind: 'story',
      title: '올라가는 길',
      text: '문이 닫히고 엘리베이터가 위로 움직였다. 소파는 조용했고, 거울에는 일행의 수만큼만 비쳤다.\n한 명씩 거울 속의 얼굴을 확인했다. 틀림없이 우리뿐이었다.\n멀어지는 로비 쪽에서 방명록에 마지막 한 줄이 마르는 소리가 났다. [[loud|“확인했습니다.”]]',
      next: 'true-end',
    },

    // ───────────────────────── 계단 ─────────────────────────
    {
      id: 'stairs-vote',
      kind: 'vote',
      title: '계단 아래',
      text: '계단 입구에 모였다. 아래는 어둠이다. 몇 칸을 내려가야 끝에 닿을까. 모두가 같은 칸에서 멈춰야 한다.',
      choices: [
        { id: 'n8', text: '여덟 칸', next: [{ when: { var: 'stairs', is: 9 }, to: 'below-end' }, { to: 'stairs-lost' }] },
        { id: 'n10', text: '열 칸', next: [{ when: { var: 'stairs', is: 11 }, to: 'below-end' }, { to: 'stairs-lost' }] },
        { id: 'n12', text: '열두 칸', next: [{ when: { var: 'stairs', is: 13 }, to: 'below-end' }, { to: 'stairs-lost' }] },
        { id: 'back', text: '내려가지 않는다', next: 'gather' },
      ],
    },
    {
      id: 'stairs-lost',
      kind: 'story',
      title: '끝나지 않는 계단',
      text: '정해진 칸을 다 내려왔는데도 계단은 이어졌다. 누군가 숫자를 다시 세려 했지만, 입을 떼기도 전에 발밑이 한 칸 사라졌다.\n한참을 구르다 겨우 위로 올라왔을 때, 조명이 한 단계 더 어두워져 있었다. 구른 사람도 구르지 않은 사람도 숨이 거칠었다.',
      onEnter: [{ time: 1 }, { stat: 'sanity', add: -2, to: 'all' }],
      next: 'gather',
    },
    {
      id: 'sign-story',
      kind: 'story',
      title: '서명',
      text: '펜을 집어 이름을 적었다. 잉크는 종이에 닿자 천천히 번졌다.\n서명한 사람의 글씨체가 아주 조금씩 방명록의 다른 글씨와 닮아 가기 시작했다. 그래도 한 사람씩 차례로 서명했다. 얌전히 기다리면 괜찮을 거라고, 서로에게 말하면서.',
      next: 'signed-end',
    },

    // ───────────────────────── 엔딩 ─────────────────────────
    {
      id: 'true-end',
      kind: 'ending',
      tier: 'true',
      title: '정확한 인원',
      text: '엘리베이터가 멈추고 문이 열렸다. 지상 1층의 로비였다. 경비원이 일행을 한 명씩 세어 명부와 맞춰 보았다. 정확했다. 그 숫자가 정확하다는 사실이, 이 일의 전부였다. 방명록의 한 줄은 지워졌고, 소파 위의 온기는 다시 식었다. 그날 이후 누구도 B7이라는 층을 찾지 못했다. 다만 한 번씩 접수대 전화가 울린다고 한다. 누군가 받으면 정중한 목소리가 묻는다. [[whisper|“거기, 몇 분이세요?”]]',
    },
    {
      id: 'quiet-end',
      kind: 'ending',
      tier: 'good',
      title: '조용한 퇴근',
      text: '엘리베이터가 지상에 닿았다. 일행은 무사했다. 다만 전화는 끝내 받지 않았고, 방명록에 어떤 숫자가 적혔는지는 아무도 모른다. 그날 이후 점검자들은 가끔 엘리베이터에서 거울을 보지 않는 버릇이 생겼다. 소파 쪽의 숨소리가 정말 멎었는지는 확인할 길이 없다.',
    },
    {
      id: 'below-end',
      kind: 'ending',
      tier: 'neutral',
      title: '계단 아래',
      text: [
        { text: '센 숫자보다 하나 적게 내려가자 계단은 거기서 끝났다. 끝에는 로비와 똑같은 로비가 있었다. 접수대, 계단, 엘리베이터. 소파만 하나 적었다.' },
        { text: '접수대의 방명록 맨 위에 일행의 이름이 이미 적혀 있었다. 날짜는 오늘이었다.', when: { flag: 'counted' } },
        { text: '벽의 층 표시는 B8이었다. 도면에는 없는 층이다.' },
      ],
    },
    {
      id: 'followed-end',
      kind: 'ending',
      tier: 'bad',
      title: '한 명이 더',
      text: '지상에 올라와 명부와 맞춰 보니 인원이 하나 더 많았다. 누구도 그 한 명이 누구인지 말하지 못했다. 모두가 그 사람과 오래 알고 지낸 것처럼 느꼈고, 아무도 이름을 기억하지 못했다. 그날 이후 점검 일지의 서명란에는 늘 한 줄이 더 있다. [[shake|잉크가 마르지 않은 채로.]]',
    },
    {
      id: 'signed-end',
      kind: 'ending',
      tier: 'bad',
      title: '새로운 서명',
      text: '조명이 다시 밝아졌다. 일행은 소파에 나란히 앉아 얌전히 기다렸다. 얼마 뒤 엘리베이터 문이 열리고 새 점검자들이 내렸다. 접수대 방명록에는 일행의 서명이 수십 줄 가운데 하나로 섞여 있었다. 날짜는 모두 같은 날이다.',
    },
    {
      id: 'blackout-end',
      kind: 'ending',
      tier: 'bad',
      title: '암전',
      text: '조명이 완전히 꺼졌다. 어둠 속에서 누군가 천천히 일행의 수를 셌다. [[whisper|하나, 둘, 셋.]] 한 번도 서두르지 않았다. 불이 다시 들어왔을 때 소파에는 한 사람이 더 앉아 있었고, 일행은 서로의 얼굴을 알아보지 못했다.',
    },
    {
      id: 'collapse-end',
      kind: 'ending',
      tier: 'bad',
      title: '정신 상실',
      text: '모두 더는 움직일 수 없었다. 누군가 소파로 다가와 한 사람씩 조심스럽게 눕혔다. 소파는 일행의 수만큼 늘어나 있었다. 전화가 울렸지만 받을 사람이 없었다.',
    },
  ],
}
