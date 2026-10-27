// B7 로비 — 시나리오 모드의 첫 대상. 과제 셋(엘리베이터·소파·계단)을 하나씩, 판마다 다른 순서로 푼다.
//
// 진실: B7 로비는 "센다". 엘리베이터로 온 사람 수를 방명록에 적어 두고, 올라갈 때 그 수와 맞아야 보내 준다.
// 소파 하나에 앉아 있는 "한 명 더"가 일행에 끼어들려 한다 (거울에 비치는 한 명, 방명록의 마지막 서명, 따뜻한 소파).
// 올라가려면 ① 엘리베이터에서 아무 버튼도 누르지 않고 ② 거울을 보지 않고 ③ 전화로 인원을 정직하게 답하고
// ④ 따뜻한 소파(판마다 다른 자리)에 "여기 계세요"라고 말해 두고 가야 한다. 하나라도 어긋나면 한 명이 더 따라온다.
//
// 과제마다 추리가 다르다: 엘리베이터는 시험 결과로 숨은 규칙을 찾고(규칙형), 소파는 쪽지 세 장 가운데 사실이 한 장뿐이라는 규칙으로
// 따뜻한 자리를 가리고(모순형), 계단은 센 방식마다 다른 범위 단서를 겹쳐 기둥 수를 좁힌 뒤 "하나 적게"를 적용한다(수치형).
// 과제 사이에는 사건(발소리·전화)과 밤(개인 행동)이 있다. 하루가 지날 때마다(성공이든 실패든) 시계가 흐르고, 이틀에 한 번
// (2일째, 4일째, 6일째) 조명이 어두워지며 여드레째(조명이 네 번 어두워진 뒤)는 암전이다.
// 조사에는 위험한 곳이 숨어 있다: 과제마다 `risk`가 있는 조사 중 하나가 판마다 뽑히고, 거기를 살핀 사람은 발견과 함께 대가를 치른다.
//
// 판마다 바뀌는 값: seat(따뜻한 소파 a·b·c), stairs(난간 기둥 수 9·11·13), order(과제 순서),
// events(사건 순서: 발소리가 먼저 fp / 전화가 먼저 ph), risk-<과제>(그 과제에서 위험한 조사).
import { buildTasks, type TaskAnswer, type TaskDef, type TaskProbe } from '../../scenario/tasks.ts'
import type { Cond, Node, PersonalOption, Scenario } from '../../scenario/types.ts'

export type SeatId = 'a' | 'b' | 'c'
export type StairsCount = 9 | 11 | 13

/** 소파 세 개: 따뜻한 쪽은 판마다 다르다 */
const SOFAS = [
  ['a', '왼쪽'],
  ['b', '가운데'],
  ['c', '오른쪽'],
] as const

/** 난간 기둥 수 후보: 판마다 하나가 정해진다 (내려가야 할 칸은 이보다 하나 적다) */
const STAIRS = [9, 11, 13] as const
const STAIR_STEPS = { 9: '여덟', 11: '열', 13: '열두' } as const

const seatIs = (id: SeatId): Cond => ({ var: 'seat', is: id })
const stairsIs = (n: StairsCount): Cond => ({ var: 'stairs', is: n })

type Findings = TaskProbe['findings']
const learn = (id: string) => ({ learn: id, to: 'actor' as const })
const sanityLater = (n: number) => [{ stat: 'sanity' as const, add: -n, to: 'actor' as const }]

/** 따뜻한 소파에 따라 발견이 다르다 (마지막 조각은 조건 없이 둔다) */
const bySeat = (make: (id: SeatId, label: string) => Findings[number]): Findings =>
  SOFAS.map(([id, label], i) => ({ ...make(id, label), ...(i < SOFAS.length - 1 ? { when: seatIs(id) } : {}) }))

/** 난간 기둥 수에 따라 발견이 다르다 */
const byStairs = (make: (n: StairsCount) => Findings[number]): Findings =>
  STAIRS.map((n, i) => ({ ...make(n), ...(i < STAIRS.length - 1 ? { when: stairsIs(n) } : {}) }))

type NightMake = Pick<PersonalOption, 'result' | 'effects' | 'later'>
/**
 * 따뜻한 소파에 따라 결과가 다른 밤 선택지. 문구는 같고 자리마다 하나만 보여서 고르는 사람이 어느 자리인지 짐작하지 못한다.
 * 이미 파티 누군가 그 단서를 알아냈으면 숨긴다.
 */
const bySeatNight = (id: string, text: string, fact: (s: SeatId) => string, make: (s: SeatId, label: string) => NightMake): PersonalOption[] =>
  SOFAS.map(([s, label]) => ({ id: `${id}-${s}`, text, when: { all: [seatIs(s), { not: { knows: fact(s) } }] }, ...make(s, label) }))
/** 난간 기둥 수에 따라 결과가 다른 밤 선택지 (위와 같다) */
const byStairsNight = (id: string, text: string, fact: (n: StairsCount) => string, make: (n: StairsCount) => NightMake): PersonalOption[] =>
  STAIRS.map((n) => ({ id: `${id}-${n}`, text, when: { all: [stairsIs(n), { not: { knows: fact(n) } }] }, ...make(n) }))

// ───────────────────────── 소파 쪽지 (모순형) ─────────────────────────
// 쪽지 세 장 가운데 사실이 적힌 것은 한 장뿐이다. 따뜻한 자리마다 쪽지 세트가 다르고, 그 규칙으로 가리면 자리가 하나로 정해진다
// (시험이 모든 자리에서 정확히 하나만 남는지 확인한다). 사실이 적힌 쪽지는 오래전에 쓰여 잉크가 바랬다 (2단계 조사).

/** 쪽지가 놓인 곳 */
const NOTE_POS = { desk: '접수대의 메모지', book: '방명록의 마지막 장', sofa: '소파 틈에 끼인 쪽지' } as const
type NotePos = keyof typeof NOTE_POS
const NOTE_READ: Record<NotePos, string> = {
  desk: '접수대의 메모지를 읽는다',
  book: '방명록의 마지막 장을 읽는다',
  sofa: '소파 틈에 끼인 쪽지를 읽는다',
}

export const SOFA_NOTES: Record<SeatId, { pos: NotePos; text: string; holds: (warm: SeatId) => boolean }[]> = {
  a: [
    { pos: 'desk', text: '가운데 소파는 차갑다.', holds: (w) => w !== 'b' },
    { pos: 'book', text: '왼쪽 소파는 차갑다.', holds: (w) => w !== 'a' },
    { pos: 'sofa', text: '가운데 소파가 따뜻하다.', holds: (w) => w === 'b' },
  ],
  b: [
    { pos: 'desk', text: '가운데 소파는 차갑다.', holds: (w) => w !== 'b' },
    { pos: 'book', text: '오른쪽 소파가 따뜻하다.', holds: (w) => w === 'c' },
    { pos: 'sofa', text: '오른쪽 소파는 차갑다.', holds: (w) => w !== 'c' },
  ],
  c: [
    { pos: 'desk', text: '왼쪽 소파가 따뜻하다.', holds: (w) => w === 'a' },
    { pos: 'book', text: '왼쪽 소파는 차갑다.', holds: (w) => w !== 'a' },
    { pos: 'sofa', text: '오른쪽 소파는 차갑다.', holds: (w) => w !== 'c' },
  ],
}
const noteId = (s: SeatId, pos: NotePos) => `note-${s}-${pos}`
/** 밤에 카펫을 살폈을 때 따뜻한 자리마다 달라지는 단서 */
const TRACE_TEXT: Record<SeatId, string> = {
  a: '가운데와 오른쪽 소파 앞의 카펫은 말끔하다. 눌린 자국이 하나도 없다.',
  b: '왼쪽과 오른쪽 소파 앞의 카펫은 말끔하다. 눌린 자국이 하나도 없다.',
  c: '왼쪽과 가운데 소파 앞의 카펫은 말끔하다. 눌린 자국이 하나도 없다.',
}
/** 사실이 적힌 쪽지(규칙에 맞는 한 장)가 놓인 곳 */
const trueNotePos = (s: SeatId): NotePos => SOFA_NOTES[s].find((n) => n.holds(s))!.pos

// ───────────────────────── 계단 단서 (수치형) ─────────────────────────
// 센 방식마다 후보를 둘로 좁힌다. 두 방식의 단서를 겹치면 기둥 수가 하나로 정해진다.

/** 기둥 수별로 1단계 조사('feel'·'half')가 주는 단서와, 그 단서가 가리키는 후보들 */
export const STAIR_CLUES: Record<StairsCount, { id: string; candidates: number[] }[]> = {
  9: [
    { id: 'feel-low', candidates: [9, 11] },
    { id: 'half-odd', candidates: [9, 13] },
  ],
  11: [
    { id: 'feel-low', candidates: [9, 11] },
    { id: 'half-high', candidates: [11, 13] },
  ],
  13: [
    { id: 'feel-high', candidates: [11, 13] },
    { id: 'half-odd', candidates: [9, 13] },
  ],
}
const STAIR_CLUE_TEXT: Record<string, string> = {
  'feel-low': '어둠 속에서 더듬어 센 기둥은 열한 개를 넘지 않는다.',
  'feel-high': '어둠 속에서 더듬어 센 기둥은 열 개를 넘는다.',
  'half-odd': '한쪽 절반을 세어 어림한 기둥은 열한 개가 아니다.',
  'half-high': '한쪽 절반을 세어 어림한 기둥은 열 개를 넘는다.',
}

// ───────────────────────── 과제 ─────────────────────────

const lift: TaskDef = {
  id: 'lift',
  title: '엘리베이터',
  period: 'day',
  intro:
    '닫힌 엘리베이터 문 앞에 모였다. 문은 거울처럼 매끈하고, 층 표시등은 B6에서 멈춰 있다. 패널에는 내려가는 층 버튼뿐이다.\n이 문을 어떻게 해야 위로 올라가는지 알아내야 한다. 문은 열린 채 일행을 기다리고 있으니, 그 앞에서 조심스럽게 시험해 볼 수 있다.',
  probes: [
    {
      id: 'panel',
      text: '패널 아래의 낙서를 읽는다',
      tier: 1,
      risk: '낙서를 읽는 동안 패널 안쪽에서 달각, 하고 무언가 버튼을 눌러 보는 소리가 났다. 안쪽에서. 손끝이 얼어붙어 한참을 움직일 수 없었다.',
      findings: [
        {
          text: '층 버튼에는 눌러 본 흔적이 가득하다. 패널 아래에 누군가 낙서를 남겼다. “누르면 돌아온다.”',
          effects: [learn('lift-panel-press')],
        },
      ],
    },
    {
      id: 'glance',
      text: '문의 거울을 정면으로 보지 않고 곁눈으로 훑는다',
      tier: 1,
      risk: '곁눈질이 길어졌다. 거울 속 일행 사이에서 누군가 천천히 고개를 돌려 이쪽을 똑바로 보았다. [[shake|눈이 마주쳤다.]] 시선을 돌리자 거울은 다시 평범해졌다.',
      findings: [
        {
          text: '거울을 똑바로 보지 않고 곁눈으로만 훑었다. 비친 일행이 한 명 더 많은 것 같다. 확실하지는 않다. 오래 보고 싶지 않은 느낌이 든다.',
          effects: [learn('lift-mirror-hint')],
        },
      ],
    },
    {
      id: 'press',
      text: '층 버튼 하나를 눌러 본다 (문은 열어 둔 채)',
      tier: 2,
      risk: '버튼이 눌린 순간 문 안쪽에서 무언가 마주 손바닥을 댔다. 차가운 진동이 손가락뼈를 타고 어깨까지 올라왔다. 한동안 손이 제 것 같지 않았다.',
      findings: [
        {
          text: '손가락이 닿은 버튼에 불이 들어왔다. 층 표시등이 B6, B5… 거꾸로 내려가더니 B7에서 멈췄다. 되돌아온 것이다. 문은 열린 채였지만 등줄기가 서늘했다.',
          effects: [learn('lift-press-back')],
          later: sanityLater(1),
        },
      ],
    },
    {
      id: 'still',
      text: '아무것도 건드리지 않고 문 앞에서 가만히 기다려 본다',
      tier: 2,
      risk: '숨을 죽이고 서 있는 동안 등 뒤에서 누군가 같은 박자로 숨을 쉬었다. 돌아보았을 때 그곳에는 아무도 없었다. 숨소리만 한 박자 늦게 멎었다.',
      findings: [
        {
          text: '숨소리조차 조심하며 문 앞에 섰다. 한참 뒤, 층 표시등이 천천히 한 칸 올라갔다. 아무도 버튼을 누르지 않았는데도.',
          effects: [learn('lift-still-up')],
        },
      ],
    },
    {
      id: 'pair',
      text: '한 명은 버튼을 누르고, 한 명은 가만히 서서 지켜본다',
      tier: 2,
      min: 2,
      findings: [
        {
          text: '한 사람이 버튼을 눌렀다. 누른 사람 쪽의 표시등만 B7로 되돌아갔고, 가만히 서 있던 사람 쪽은 한 칸 올라갔다. 누른 사람만 돌아오는 것이다.',
          effects: [learn('lift-pair')],
        },
      ],
    },
    {
      id: 'panel-open',
      text: '점검 열쇠로 패널 뚜껑을 열고 안쪽 배선을 본다',
      tier: 1,
      when: { item: 'key', by: 'actor' },
      findings: [
        {
          text: '열쇠가 패널 뚜껑에 꼭 맞았다. 뚜껑을 열자 층 버튼의 선들이 모두 한 단자로 묶여 있다. 어느 버튼을 눌러도 같은 곳으로 돌아오게 되어 있다.',
          effects: [learn('lift-wiring')],
        },
      ],
    },
    {
      id: 'sign',
      text: '문틈에 붙은 낡은 표지를 읽는다',
      tier: 3,
      findings: [
        {
          text: '문틈에 낡은 표지가 붙어 있다. “아무것도 누르지 않은 사람만 올라갑니다. 거울은 보지 마세요.”',
          effects: [learn('lift-sign')],
        },
      ],
    },
  ],
  night: {
    options: [
      {
        id: 'listen',
        text: '혼자 문에 귀를 대고 안쪽의 소리를 듣는다',
        when: { not: { knows: 'lift-night-hum' } },
        result:
          '문에 귀를 대고 숨을 죽였다. 문 안쪽에서 층 표시등이 올라가려는 낮은 소리가 났다. 그러다 어디선가 버튼이 눌리는 소리가 들리면, 그 소리는 뚝 끊기고 다시 처음부터 시작되었다.',
        effects: [learn('lift-night-hum')],
        later: sanityLater(1),
      },
      {
        id: 'scrawl',
        text: '혼자 패널 낙서 위에 덧쓴 글씨를 읽는다',
        when: { not: { knows: 'lift-night-scrawl' } },
        result:
          '낙서 위에 누군가 덧써 둔 작은 글씨가 있었다. “올라간 사람들은 모두 아무것도 누르지 않았다.” 글씨는 아직 마르지 않은 것처럼 번들거렸다.',
        effects: [learn('lift-night-scrawl')],
        later: sanityLater(1),
      },
      {
        id: 'drawer',
        text: '혼자 접수대 서랍을 조심스럽게 뒤져 본다',
        when: { not: { item: 'key' } },
        result:
          '서랍 안쪽으로 손을 넣어 종이 클립과 닳은 연필 사이를 더듬었다. 작고 차가운 것이 손끝에 걸렸다. 열쇠였다. “점검용”이라고 적힌 꼬리표가 달려 있다.',
        effects: [{ give: 'key', to: 'actor' }],
      },
    ],
  },
  hazard: [{ stat: 'sanity', add: -3, to: 'actor' }],
  question: '이 엘리베이터를 어떻게 해야 위로 올라가는가?',
  answers: [
    {
      id: 'once',
      text: '거울은 보지 않고, 층 버튼을 한 번만 가볍게 누른다',
      right: false,
      wrong:
        '층 버튼 하나를 눌렀다. 표시등이 거꾸로 내려가더니 B7에서 멈췄다. 되돌아온 것이다.\n한 번이든 여러 번이든, 누르면 돌아오는 모양이다.',
      wrongFact: 'lift-no-once',
    },
    { id: 'still', text: '버튼은 누르지 않고, 거울도 보지 않은 채 문이 닫히기를 기다린다', right: true },
    {
      id: 'mirror',
      text: '버튼은 누르지 않고, 거울로 일행의 수를 확인한 뒤 기다린다',
      right: false,
      wrong: '거울 속에서 일행을 한 명씩 세어 보았다. [[shake|하나가 더 있었다.]] 그 사람은 이쪽을 보고 있지 않았다.\n눈을 돌린 뒤에도 한참 동안 시선이 따가웠다.',
      wrongFact: 'lift-no-mirror',
    },
    {
      id: 'top',
      text: '거울은 보지 않고, 가장 높은 층(B1) 버튼을 끝까지 누른다',
      right: false,
      wrong: 'B1 버튼에 불이 들어왔다. 엘리베이터는 한참을 내려가더니 같은 로비에 같은 소리로 문이 열렸다.\n어느 층을 누르든 돌아오는 것이다.',
      wrongFact: 'lift-no-top',
    },
  ] satisfies TaskAnswer[],
  solved:
    '문 앞에서 한동안 가만히 기다렸다. 아무도 버튼을 누르지 않았고, 아무도 거울을 보지 않았다.\n층 표시등이 한 칸씩 위로 올라갔다. 문이 스스로 닫히려는 기척이 났다. 문틈에 발을 끼워 다시 열어 두었다.\n이 방법이 맞다. 나갈 때 그대로 하면 된다.',
  onSolve: [{ learn: 'lift-rule', to: 'all' }],
  board: {
    text: '이 엘리베이터를 어떻게 해야 위로 올라가는가?',
    facts: [
      'lift-panel-press',
      'lift-mirror-hint',
      'lift-press-back',
      'lift-still-up',
      'lift-pair',
      'lift-sign',
      'lift-no-once',
      'lift-no-mirror',
      'lift-no-top',
      'lift-night-hum',
      'lift-night-scrawl',
      'lift-wiring',
      'lift-rule',
    ],
    answer: '아무 버튼도 누르지 않고, 거울도 보지 않은 채 가만히 기다린다.',
  },
}

const sofa: TaskDef = {
  id: 'sofa',
  title: '소파',
  period: 'day',
  intro:
    '소파 세 개가 같은 방향을 보고 있다. 오래되었지만 먼지는 없다. 이 중 하나에는 방금까지 누가 앉았던 온기가 남아 있다고 한다.\n로비 곳곳에 쪽지가 흩어져 있다. 누구의 글씨인지 알 수 없다. 어느 쪽지를 믿어야 할까.',
  probes: [
    ...(Object.keys(NOTE_POS) as NotePos[]).map(
      (pos): TaskProbe => ({
        id: `memo-${pos}`,
        text: NOTE_READ[pos],
        tier: 1,
        ...(pos === 'sofa'
          ? {
              needsHealthy: true,
              risk: '쪽지를 빼내려 손을 밀어 넣는 순간 소파 틈이 손목을 꼭 물었다. 쿠션이 숨을 쉬듯 한 번 부풀었고, 손을 빼냈을 때 손목에는 붉은 자국이 선명했다.',
            }
          : {}),
        findings: bySeat((s) => ({
          text: `${NOTE_POS[pos]}에는 이렇게 적혀 있다. “${SOFA_NOTES[s].find((n) => n.pos === pos)!.text}”`,
          effects: [learn(noteId(s, pos))],
        })),
      }),
    ),
    {
      id: 'notice',
      text: '접수대 위의 작은 안내판을 읽는다',
      tier: 1,
      findings: [
        {
          text: '접수대 위에 작은 안내판이 서 있다. “쪽지는 세 장 남겨 두었습니다. 사실이 적힌 쪽지는 그중 한 장뿐이며, 그 쪽지는 오래전에 쓰인 것입니다.”',
          effects: [learn('sofa-rule')],
        },
      ],
    },
    {
      id: 'ink',
      text: '쪽지들의 잉크를 비교해 본다',
      tier: 2,
      risk: '쪽지를 겹쳐 들여다보던 손가락이 종이 모서리에 베였다. 얇은 상처에서 피가 배어 나와 쪽지 한 장에 번졌는데, 번진 자국은 금세 마른 잉크처럼 검게 변했다.',
      findings: bySeat((s) => ({
        text: `세 쪽지의 잉크를 가까이서 비교했다. ${NOTE_POS[trueNotePos(s)]}의 잉크만 오래되어 갈색으로 바랬다. 나머지 둘은 최근에 쓴 글씨다.`,
        effects: [learn(`ink-${s}`)],
      })),
    },
    {
      id: 'pair',
      text: '두 사람이 동시에 왼쪽과 가운데 소파를 만져 본다',
      tier: 2,
      min: 2,
      needsHealthy: true,
      risk: '손을 떼려는데 쿠션이 손바닥에 들러붙은 것처럼 놓아 주지 않았다. 둘이 힘을 주어 잡아당기자 그제야 툭 떨어졌고, 손바닥이 화끈거렸다.',
      findings: bySeat((s) => ({
        text:
          s === 'a'
            ? '둘이 동시에 왼쪽과 가운데 소파에 손을 얹었다. 왼쪽 소파가 따뜻하다. 가운데 소파는 차갑다.'
            : s === 'b'
              ? '둘이 동시에 왼쪽과 가운데 소파에 손을 얹었다. 가운데 소파가 따뜻하다. 왼쪽 소파는 차갑다.'
              : '둘이 동시에 왼쪽과 가운데 소파에 손을 얹었다. 둘 다 차갑다.',
        effects: [learn(`pair-${s}`)],
        ...(s === 'c' ? {} : { later: sanityLater(1) }),
      })),
    },
    {
      id: 'lens',
      text: '돋보기로 쪽지들의 잉크를 자세히 들여다본다',
      tier: 1,
      when: { item: 'loupe', by: 'actor' },
      findings: bySeat((s) => {
        const real = SOFA_NOTES[s].find((n) => n.holds(s))!
        return {
          text: `돋보기로 쪽지들의 잉크를 들여다보았다. 가장 오래된 잉크로 쓰인 글은 “${real.text}”이다. (${NOTE_POS[real.pos]})`,
          effects: [learn(`lens-${s}`)],
        }
      }),
    },
    {
      id: 'touch',
      text: '소파 세 개를 차례로 만져 본다',
      tier: 3,
      needsHealthy: true,
      risk: '따뜻한 소파에서 손을 떼는 순간 쿠션이 손목을 휘감듯 조여 왔다. 겨우 빼냈을 때 팔 전체가 저릿했다. 소파는 아무 일 없었다는 듯 다시 부풀어 올랐다.',
      findings: bySeat((s, label) => ({
        text: `세 소파를 차례로 만져 보았다. ${label} 소파만 방금까지 누가 앉았던 것처럼 따뜻하다. 손을 떼자 쿠션이 천천히 부풀어 올랐다.`,
        effects: [learn(`warm-${s}`)],
        later: sanityLater(1),
      })),
    },
  ],
  night: {
    options: [
      ...bySeatNight(
        'trace',
        '혼자 소파 앞 카펫의 눌린 자국을 살핀다',
        (s) => `trace-${s}`,
        (s) => ({
          result: `허리를 굽혀 소파 앞의 카펫을 하나씩 살폈다. ${TRACE_TEXT[s]} 한 곳에서만 사람이 오래 서 있던 느낌이 남아 있다.`,
          effects: [learn(`trace-${s}`)],
          later: sanityLater(1),
        }),
      ),
      {
        id: 'crumpled',
        text: '혼자 접수대 쓰레기통의 구겨진 쪽지를 펴 본다',
        when: { not: { knows: 'sofa-night-first' } },
        result:
          '쓰레기통 바닥에서 구겨진 쪽지를 꺼내 펴 보았다. 글씨가 희미하다. “사실은 가장 먼저 쓴 한 장이다. 나중에 쓴 쪽지는 믿지 마라.”',
        effects: [learn('sofa-night-first')],
      },
      {
        id: 'shelf',
        text: '혼자 접수대 곁의 선반을 뒤져 본다',
        when: { not: { item: 'loupe' } },
        result: '선반 구석의 먼지 없는 상자 안에 손바닥만 한 돋보기가 놓여 있었다. 렌즈에는 지문 하나 묻어 있지 않다.',
        effects: [{ give: 'loupe', to: 'actor' }],
      },
    ],
  },
  hazard: [{ hurt: 'actor' }],
  question: '온기가 남은 소파는 어느 쪽인가?',
  answers: SOFAS.map(
    ([id, label]): TaskAnswer => ({
      id: `sofa-${id}`,
      text: `${label} 소파다`,
      right: seatIs(id),
      wrong: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n그쪽은 [[cold|차가웠다.]] 말은 허공에 떨어졌고, 다른 쪽에서 무언가 일어서는 소리가 났다.\n이 소파는 아니다.`,
      wrongFact: `cold-${id}`,
    }),
  ),
  solved: SOFAS.map(([id, label]) => ({
    text: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n쿠션이 천천히 식어 갔다. 숨소리가 멎었다. 맞다. 온기가 남은 소파는 이쪽이다.\n떠나기 전에 한 곳에만 이렇게 말해 두면 되는 모양이다. 여러 곳에 말을 걸면 오히려 숨소리가 엉킨다.`,
    when: seatIs(id),
  })),
  onSolve: [{ learn: 'greet-rule', to: 'all' }],
  board: {
    text: '온기가 남은 소파는 어느 쪽인가?',
    facts: [
      ...(['a', 'b', 'c'] as const).flatMap((s) => (Object.keys(NOTE_POS) as NotePos[]).map((pos) => noteId(s, pos))),
      'sofa-rule',
      'sofa-night-first',
      ...SOFAS.flatMap(([id]) => [`ink-${id}`, `lens-${id}`, `pair-${id}`, `trace-${id}`, `warm-${id}`, `cold-${id}`]),
      'greet-rule',
    ],
    answer: SOFAS.map(([id, label]) => ({ text: `${label} 소파다.`, when: seatIs(id) })),
  },
}

const stairs: TaskDef = {
  id: 'stairs',
  title: '계단',
  period: 'day',
  intro:
    '계단 입구에 모였다. 난간 기둥이 어둠 속으로 이어진다. 계단 아래에서 누군가 천천히 숫자를 센다. [[whisper|하나… 둘… 셋…]]\n몇 칸을 내려가야 끝에 닿는지 알아내야 한다.',
  probes: [
    {
      id: 'feel',
      text: '어둠 속에서 난간 기둥을 손으로 더듬어 센다',
      tier: 1,
      risk: '기둥을 세다가 손바닥이 난간 이음매의 녹슨 쇠 조각에 깊이 긁혔다. 어둠 속이라 얼마나 다쳤는지 보이지 않았지만, 따뜻한 것이 손목을 타고 흘렀다.',
      findings: byStairs((n) => ({
        text: `어둠 속에서 손으로 더듬으며 난간 기둥을 셌다. 손끝이 떨려서 정확하지는 않다.\n${STAIR_CLUE_TEXT[STAIR_CLUES[n][0].id]}`,
        effects: [learn(STAIR_CLUES[n][0].id)],
        later: sanityLater(1),
      })),
    },
    {
      id: 'half',
      text: '난간 한쪽의 절반만 세고 두 배로 어림해 본다',
      tier: 1,
      findings: byStairs((n) => ({
        text: `난간 한쪽의 기둥만 세고 두 배로 어림해 보았다. 대략의 값이다.\n${STAIR_CLUE_TEXT[STAIR_CLUES[n][1].id]}`,
        effects: [learn(STAIR_CLUES[n][1].id)],
      })),
    },
    {
      id: 'torch',
      text: '손전등으로 비추며 난간 기둥을 하나씩 센다',
      tier: 1,
      when: { item: 'torch', by: 'actor' },
      findings: byStairs((n) => ({
        text: `청동 손전등으로 비추며 난간 기둥을 하나씩 세었다. 모두 ${n}개다. 틀림없다.`,
        effects: [learn(`torch-${n}`)],
      })),
    },
    {
      id: 'sign',
      text: '계단 입구의 낡은 안내판을 읽는다',
      tier: 1,
      findings: [
        {
          text: '계단 입구에 낡은 안내판이 붙어 있다. “계단은 세는 사람의 수만큼 길어집니다. 센 숫자보다 하나 적게 내려가야 끝이 있습니다.”',
          effects: [learn('stairs-rule')],
        },
      ],
    },
    {
      id: 'both',
      text: '두 사람이 난간 양쪽에서 동시에 센다',
      tier: 2,
      min: 2,
      needsHealthy: true,
      risk: '둘이 동시에 난간에 체중을 싣자 난간 한쪽이 삐걱, 하고 흔들렸다. 휘청하며 계단 모서리에 정강이를 세게 부딪쳤다. 아래의 숫자 세는 소리가 그 순간 한 박자 멈췄다.',
      findings: byStairs((n) => ({
        text: `두 사람이 난간 양쪽에서 동시에 세어 합쳤다. 기둥은 모두 ${n}개다. 틀림없다.`,
        effects: [learn(`exact-${n}`)],
      })),
    },
    {
      id: 'walk',
      text: '직접 몇 칸 내려가며 세어 본다',
      tier: 2,
      needsHealthy: true,
      risk: '되짚어 올라오는 길에 발밑의 한 칸이 사라진 것처럼 푹 꺼졌다. 난간을 잡았지만 발목이 크게 꺾였다. 올라와서 보니 그 칸은 원래 자리에 멀쩡히 있었다.',
      findings: byStairs((n) => ({
        text: `칸을 세며 조심스럽게 내려갔다. ${STAIR_STEPS[n]} 칸에서 계단이 끝났다. 끝에는 로비와 똑같은 로비가 있었다. 서둘러 되짚어 올라왔다.`,
        effects: [learn(`walk-${n}`)],
        later: sanityLater(2),
      })),
    },
    {
      id: 'wall',
      text: '계단 벽에 새겨진 눈금을 읽는다',
      tier: 3,
      risk: '눈금을 더듬어 읽던 손가락이 벽의 날카로운 홈에 걸려 손톱이 갈라졌다. 벽이 손가락을 놓아 주기 전까지 아주 짧게, 안쪽에서 무언가 당기는 느낌이 있었다.',
      findings: byStairs((n) => ({
        text: `계단 벽에 오래된 눈금이 새겨져 있다. 맨 아래 눈금 옆에 작은 글씨가 있다. “${STAIR_STEPS[n]}.”`,
        effects: [learn(`wall-${n}`)],
      })),
    },
  ],
  night: {
    options: [
      ...byStairsNight(
        'echo',
        '혼자 난간을 손톱으로 튕겨 울림의 개수를 센다',
        (n) => (n === 13 ? 'echo-high' : 'echo-low'),
        (n) => ({
          result:
            n === 13
              ? '난간 기둥을 손톱으로 하나씩 튕기며 울림을 셌다. 한 번 세고, 다시 한 번 셌다. 열두 번을 넘어서도 울림은 이어졌다.'
              : '난간 기둥을 손톱으로 하나씩 튕기며 울림을 셌다. 한 번 세고, 다시 한 번 셌다. 열두 번을 채우기 전에 울림은 끊겼다.',
          effects: [learn(n === 13 ? 'echo-high' : 'echo-low')],
          later: sanityLater(1),
        }),
      ),
      {
        id: 'hear',
        text: '혼자 계단 아래에서 올라오는 숫자 세는 소리를 따라 센다',
        when: { not: { knows: 'stairs-night-skip' } },
        result:
          '낮은 목소리로 아래의 숫자를 따라 센다. 하나, 둘, 셋. 입술이 말라 가는데도 멈출 수 없었다.\n숫자는 매번 마지막 한 칸을 건너뛰고 멎는다. 그 빈칸이 잠시 이쪽을 바라보는 느낌이 들었다.',
        effects: [learn('stairs-night-skip')],
        later: sanityLater(2),
      },
      {
        id: 'desk',
        text: '혼자 접수대 안쪽 서랍을 뒤져 본다',
        when: { not: { item: 'torch' } },
        result: '접수대 안쪽으로 손을 넣어 서랍을 열었다. 서랍 맨 안쪽에서 청동 손전등을 찾았다. 아직 따뜻하다. 방금까지 누군가 쥐고 있었던 것처럼.',
        effects: [{ give: 'torch', to: 'actor' }],
      },
    ],
  },
  hazard: [{ hurt: 'actor' }],
  question: '계단은 몇 칸을 내려가야 끝에 닿는가?',
  answers: STAIRS.map(
    (n): TaskAnswer => ({
      id: `s${n - 1}`,
      text: `${STAIR_STEPS[n]} 칸이다`,
      right: stairsIs(n),
      wrong: `${STAIR_STEPS[n]} 칸을 내려왔는데도 계단은 이어졌다. 발밑이 한 칸 사라지는 느낌에 서둘러 올라왔다.\n이 숫자가 아니다. 올라오는 동안 모두의 무릎이 후들거렸다.`,
      wrongFact: `no-steps-${n - 1}`,
    }),
  ),
  solved:
    '정해 둔 칸까지 내려가자 계단이 정말로 거기서 끝났다. 끝에는 로비와 똑같은 로비가 있었다. 소파만 하나 적었다.\n서둘러 계단을 되짚어 올라왔다. 센 숫자보다 하나 적게. 이 규칙을 기억해 둔다.',
  onSolve: [{ learn: 'stairs-rule', to: 'all' }],
  board: {
    text: '계단은 몇 칸을 내려가야 끝에 닿는가?',
    facts: [
      ...Object.keys(STAIR_CLUE_TEXT),
      'stairs-rule',
      'echo-low',
      'echo-high',
      'stairs-night-skip',
      ...STAIRS.flatMap((n) => [`exact-${n}`, `walk-${n}`, `wall-${n}`, `torch-${n}`, `no-steps-${n - 1}`]),
    ],
    answer: STAIRS.map((n) => ({ text: `${STAIR_STEPS[n]} 칸이다. (센 숫자보다 하나 적게)`, when: stairsIs(n) })),
  },
}

// ───────────────────────── 막간: 사건과 밤 ─────────────────────────
// 과제 ①이 풀리면 첫 사건, 과제 ②가 풀리면 둘째 사건(발소리와 전화, 순서는 판마다 다르다)이 오고, 둘 다 밤(개인 행동)으로 이어진다.
// 밤이 끝나 새 낮이 오면 다음 과제다.

/** 밤의 스텟 선택지. 오답·패스 뒤의 밤에는 과제의 선택지와 함께, 과제를 푼 뒤의 밤에는 이것만 나온다. */
const NIGHT_STAT: PersonalOption[] = [
  {
    id: 'train-body',
    text: '계단 입구에서 몸을 풀고 단련한다',
    result:
      '계단 입구의 차가운 난간을 붙잡고 몸을 풀기 시작했다. 아래의 어둠을 곁눈질하며 팔을 돌리고, 무릎을 굽혔다 폈다.\n밤새 몸을 움직였다. 다리에 힘이 돌아왔다. 숨이 가쁜 동안만큼은 이상하게 아무 생각도 나지 않았다.',
    effects: [{ stat: 'body', add: 1, to: 'actor' }],
  },
  {
    id: 'study',
    text: '방명록과 낙서를 다시 읽으며 머릿속을 정리한다',
    result:
      '방명록을 무릎 위에 펼치고 낙서를 한 글자씩 짚어 읽었다. 읽은 줄을 다시 읽고, 또 읽었다.\n같은 줄을 몇 번이고 읽었다. 글자 사이의 빈틈이 보이기 시작한다. 빈틈에는 어떤 규칙이 있는 것 같았다.',
    effects: [{ stat: 'insight', add: 1, to: 'actor' }],
  },
  {
    id: 'rest',
    text: '소파에서 먼 구석에 앉아 마음을 가라앉힌다',
    calming: true,
    result:
      '소파에서 가장 먼 구석에 등을 붙이고 앉았다. 눈을 감고 들숨과 날숨을 천천히 셌다. 이번에는 사람 수가 아니라 숨만 셌다.\n숨을 골랐다. 마음이 가라앉았고 몸의 통증도 조금 풀렸다.',
    effects: [{ stat: 'sanity', add: 3, to: 'actor' }, { heal: 'actor' }],
  },
]

/** 사건 순서는 판마다 다르다: 발소리가 먼저(fp)이거나 전화가 먼저(ph)다 */
const EVENT_ORDERS = ['fp', 'ph'] as const
const eventsAre = (o: (typeof EVENT_ORDERS)[number]): Cond => ({ var: 'events', is: o })

const built = buildTasks({
  tasks: [lift, sofa, stairs],
  after: 'gather',
  nightCommon: NIGHT_STAT,
  dayClock: true,
  between: [
    // 과제 하나가 풀릴 때마다 아직 안 겪은 사건 하나가 온다: 발소리가 먼저인 판은 발소리 → 전화, 전화가 먼저인 판은 전화 → 발소리
    {
      when: {
        any: [
          { all: [eventsAre('fp'), { not: { flag: 'footsteps' } }] },
          { all: [eventsAre('ph'), { flag: 'called' }, { not: { flag: 'footsteps' } }] },
        ],
      },
      to: 'event-footsteps',
    },
    { when: { not: { flag: 'called' } }, to: 'phone-call' },
    { to: 'night' },
  ],
})

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

const STORY_NODES: Node[] = [
  // ───── 도착
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
        result:
          '접수대로 걸어가 방명록을 내려다본다. 두꺼운 종이는 오래된 호텔의 것처럼 누렇게 바랬는데, 펜 자국만은 이상하리만치 선명하다.\n접수대 위에 방명록이 펼쳐져 있다. 서명은 수십 줄인데 날짜 칸이 모두 같은 날이다. 마치 한자리에서 한꺼번에 적은 것처럼.',
        effects: [{ learn: 'book-date', to: 'actor' }],
      },
      {
        id: 'lights',
        text: '천장 조명을 올려다본다',
        result:
          '고개를 들어 천장을 올려다본다. 조명은 숨을 쉬듯 느릿하게 흐려졌다가, 한참 지나서야 제 밝기로 돌아온다.\n[[flicker|조명이 천천히 반 칸 어두워지더니]], 한참 뒤에 다시 돌아왔다. 일정한 간격이 있는 것 같다. 아마 7분. 그 간격의 끝에 무엇이 있는지는 아직 모른다.',
        effects: [{ learn: 'light-cycle', to: 'actor' }],
      },
      {
        id: 'door',
        text: '돌아서서 엘리베이터 문을 본다',
        result:
          '돌아서서 엘리베이터 앞에 선다. 닫힌 문은 거울처럼 매끈해서 일행의 뒷모습이 흐릿하게 비친다.\n우리는 어떻게 이 층에 내려왔을까, 하는 생각이 불쑥 든다. 올라가는 길은 아직 보이지 않는다.',
      },
      {
        id: 'sofas',
        text: '소파들을 둘러본다',
        result:
          '소파들을 천천히 둘러본다. 같은 천, 같은 간격, 같은 방향.\n소파 세 개가 나란히 놓여 있다. 오래되었지만 먼지는 없다. 누군가 매일 닦아 두는 것처럼.',
      },
    ],
    next: built.enter,
  },

  // ───── 과제들
  ...built.nodes,

  // ───── 사건: 발소리 (과제 ①이 풀린 뒤)
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
        result:
          '발소리를 한 걸음 뒤에서 따라갔다. 카펫에는 발자국이 생기지 않는데도, 소리는 분명한 간격으로 이어졌다.\n발소리는 소파에서 시작해 소파로 돌아간다. 따라가던 사람의 목덜미가 서늘했다. 그것은 처음부터 어디로도 가지 않았다.',
        effects: [{ flag: 'footsteps' }, { learn: 'extra-returns', to: 'all' }],
        later: [{ stat: 'sanity', add: -2, to: 'all' }],
        next: 'night',
      },
      {
        id: 'quiet',
        text: '숨을 죽이고 가만히 있는다',
        result:
          '숨을 죽이고 서로의 어깨가 닿을 만큼 가까이 모였다. 심장 소리가 커서 발소리와 구별이 되지 않았다.\n발소리는 한참 일행 곁에 머물다가 멀어졌다. 아무 일도 없었다. 그래서 더 불안했다.',
        effects: [{ flag: 'footsteps' }],
        next: 'night',
      },
      {
        id: 'count-aloud',
        text: '소리 내어 “하나, 둘, …” 인원을 센다',
        result:
          '누군가 용기를 내어 “하나”라고 입을 뗐다. 한 명씩 차례로 이어서 세어 나갔다.\n일행이 한 명씩 세는 소리 뒤에, 어디선가 한 명이 더 [[shake|“…셋”]]이라고 대답했다. 발소리가 멎었다. 그것은 만족한 듯 조용했다.',
        effects: [{ flag: 'footsteps' }, { flag: 'invited' }, { learn: 'extra-voice', to: 'all' }],
        later: [{ stat: 'sanity', add: -1, to: 'all' }],
        next: 'night',
      },
    ],
  },

  // ───── 사건: 전화 (과제 ②가 풀린 뒤)
  {
    id: 'phone-call',
    period: 'night',
    kind: 'vote',
    title: '접수대 전화',
    text: '그때, 접수대에서 전화벨이 울리기 시작했다. 낮고 느린 벨소리가 빈 로비를 한 바퀴 돌아 나왔다.\n수화기를 들자 숨 쉬는 소리가 들리더니, 정중한 목소리가 물었다. [[whisper|“거기, 몇 분이세요?”]] 일행이 서로를 바라보았다.',
    choices: [
      {
        id: 'truth',
        text: '“{players}명입니다.”',
        result:
          '수화기 너머가 잠시 조용해졌다. 누군가 사람 수를 하나씩 맞춰 보는 듯한 침묵이었다.\n[[whisper|“…확인했습니다.”]]\n방명록의 어느 한 줄이 펜도 닿지 않은 채 조용히 지워졌다. 전화가 끊기기 전에 목소리가 한마디를 덧붙였다. “소파의 손님께는 한 곳에만 인사를 해 주세요. 여기 계시라고.”',
        effects: [{ flag: 'called' }, { flag: 'counted' }, { learn: 'phone-count', to: 'all' }, { learn: 'greet-rule', to: 'all' }],
        next: 'night',
      },
      {
        id: 'plus-one',
        text: '“한 명 더 있어요.”',
        result:
          '말이 입 밖으로 나가자마자 후회가 밀려왔다. 수화기 너머에서 만족스러운 숨이 새어 나왔다.\n[[loud|“그럼 그분도 함께 모시겠습니다.”]]\n소파 쪽에서 누군가 천천히 일어나는 소리가 났다. 아무도 그쪽을 돌아보지 못했다.',
        effects: [{ flag: 'called' }, { flag: 'invited' }, { learn: 'phone-count', to: 'all' }],
        later: [{ stat: 'sanity', add: -2, to: 'all' }],
        next: 'night',
      },
      {
        id: 'hang-up',
        text: '아무 말 없이 수화기를 내려놓는다',
        result:
          '수화기를 내려놓는 손이 생각보다 무거웠다. 딸깍, 하는 소리가 로비 구석구석까지 울렸다.\n전화는 곧 다시 울렸지만, 누구도 받지 않았다. 한동안 벨소리가 벽에서 벽으로 돌아다녔다. 그러다 어느 순간 벨이 멎었고, 멎은 자리에 정적이 더 두껍게 고였다.',
        effects: [{ flag: 'called' }],
        next: 'night',
      },
    ],
  },

  // ───── 밤: 개인 행동 (과제 사이). 혼자 하는 행동은 이야기만 있고 단서는 없다.
  {
    id: 'night',
    period: 'night',
    kind: 'personal',
    title: '로비의 밤',
    text: [
      { text: '조명이 낮아진 로비는 낮과 다르다. 각자 흩어져 각자의 일을 한다.' },
      { text: '[[whisper|(귀에서 낮은 소리가 계속 맴돈다.)]]', when: { stat: 'sanity', max: 3, by: 'me' } },
    ],
    options: NIGHT_STAT,
    next: built.enter,
  },

  // ───── 마지막 선택 (세 과제를 모두 푼 뒤)
  {
    id: 'gather',
    kind: 'vote',
    title: '이제 어디로',
    text: [
      { text: '세 가지를 모두 알아냈다. 조명이 거의 꺼져 간다. 이제 이 로비를 떠날 길을 골라야 한다.' },
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
    ],
  },

  // ───── 엘리베이터
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
        when: seatIs(id),
        text: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n${label} 소파가 조용히 가라앉았다. 숨소리가 멎고, 쿠션이 천천히 식어 갔다.`,
      },
      {
        action: `greet-${id}`,
        text: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n${label} 소파는 차가웠다. 말은 허공에 떨어졌고, 다른 쪽에서 무언가 일어서는 소리가 났다.`,
        later: sanityLater(2),
      },
    ]),
    outcomes: [
      { when: { picked: 'press' }, effects: [{ time: 1 }], later: [{ stat: 'sanity', add: -2, to: 'all' }, { hurt: { picked: 'press' } }], next: 'press-fail' },
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
      { next: 'ascend-follow' },
    ],
  },
  {
    id: 'press-fail',
    kind: 'story',
    title: '되돌아온 로비',
    text: '누군가 버튼을 눌렀다. 불이 들어온 숫자를 모두가 보았다.\n문이 닫히고 엘리베이터는 한참을 내려가더니, 같은 로비에 같은 소리로 문이 열렸다. 문이 닫히는 순간 버튼을 누른 사람의 팔이 문틈에 끼었다.\n비명은 짧았다. 로비는 아무 일도 없었다는 듯 같은 조도로 일행을 맞았다. 시간이 한참 흘러 있었다.',
    next: 'gather',
  },
  {
    id: 'mirror-story',
    kind: 'story',
    title: '거울 속',
    text: '거울 속에서 한 사람이 천천히 이쪽으로 걸어 나왔다. [[whisper|유리를 넘는 소리는 나지 않았다.]]\n그는 일행 사이에 서서 아무 일도 없었다는 듯 같은 방향을 바라보았다. 문이 닫혔다.\n올라가는 내내 아무도 서로의 얼굴을 쳐다보지 못했다.',
    onEnter: [{ flag: 'end-follow' }],
    next: 'bad-end',
  },
  {
    id: 'ascend-follow',
    kind: 'story',
    title: '올라가는 길',
    text: '문이 닫히고 엘리베이터가 위로 움직였다. 소파 쪽에서 마지막으로 무언가 일어서는 소리가 났다.\n올라가는 내내 숨소리가 하나 더 많았다. 문이 열렸을 때 누구도 일행의 수를 세지 않았다.',
    onEnter: [{ flag: 'end-follow' }],
    next: 'bad-end',
  },
  {
    id: 'ascend-true',
    kind: 'story',
    title: '올라가는 길',
    text: '문이 닫히고 엘리베이터가 위로 움직였다. 소파는 조용했고, 거울에는 일행의 수만큼만 비쳤다.\n한 명씩 거울 속의 얼굴을 확인했다. 틀림없이 우리뿐이었다.\n멀어지는 로비 쪽에서 방명록에 마지막 한 줄이 마르는 소리가 났다. [[loud|“확인했습니다.”]]',
    next: 'true-end',
  },

  // ───── 계단
  {
    id: 'stairs-vote',
    kind: 'vote',
    title: '계단 아래',
    text: '계단 입구에 모였다. 아래는 어둠이다. 알아낸 대로, 몇 칸을 내려가야 끝에 닿을까. 모두가 같은 칸에서 멈춰야 한다.',
    choices: [
      ...STAIRS.map((n) => ({
        id: `s${n - 1}`,
        text: `${STAIR_STEPS[n]} 칸`,
        next: [{ when: stairsIs(n), to: 'below-end' }, { to: 'stairs-lost' }],
      })),
      { id: 'back', text: '내려가지 않는다', next: 'gather' },
    ],
  },
  {
    id: 'stairs-lost',
    kind: 'story',
    title: '끝나지 않는 계단',
    text: '정해진 칸을 다 내려왔는데도 계단은 이어졌다. 누군가 숫자를 다시 세려 했지만, 입을 떼기도 전에 발밑이 한 칸 사라졌다.\n한참을 구르다 겨우 위로 올라왔을 때, 시간이 한참 흘러 있었다. 구른 사람도 구르지 않은 사람도 숨이 거칠었다.',
    onEnter: [{ time: 1 }, { stat: 'sanity', add: -2, to: 'all' }],
    next: 'gather',
  },
  {
    id: 'sign-story',
    kind: 'story',
    title: '서명',
    text: '펜을 집어 이름을 적었다. 잉크는 종이에 닿자 천천히 번졌다.\n서명한 사람의 글씨체가 아주 조금씩 방명록의 다른 글씨와 닮아 가기 시작했다. 그래도 한 사람씩 차례로 서명했다. 얌전히 기다리면 괜찮을 거라고, 서로에게 말하면서.',
    onEnter: [{ flag: 'end-sign' }],
    next: 'bad-end',
  },

  // ───── 엔딩 (3개)
  {
    id: 'true-end',
    kind: 'ending',
    tier: 'true',
    title: '정확한 인원',
    text: '엘리베이터가 멈추고 문이 열렸다. 지상 1층의 로비였다. 경비원이 일행을 한 명씩 세어 명부와 맞춰 보았다. 정확했다. 그 숫자가 정확하다는 사실이, 이 일의 전부였다. 방명록의 한 줄은 지워졌고, 소파 위의 온기는 다시 식었다. 그날 이후 누구도 B7이라는 층을 찾지 못했다. 다만 한 번씩 접수대 전화가 울린다고 한다. 누군가 받으면 정중한 목소리가 묻는다. [[whisper|“거기, 몇 분이세요?”]]',
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
    id: 'bad-end',
    kind: 'ending',
    tier: 'bad',
    title: '한 명이 더',
    text: [
      {
        text: '지상에 올라와 명부와 맞춰 보니 인원이 하나 더 많았다. 누구도 그 한 명이 누구인지 말하지 못했다. 모두가 그 사람과 오래 알고 지낸 것처럼 느꼈고, 아무도 이름을 기억하지 못했다. 그날 이후 점검 일지의 서명란에는 늘 한 줄이 더 있다. [[shake|잉크가 마르지 않은 채로.]]',
        when: { flag: 'end-follow' },
      },
      {
        text: '조명이 다시 밝아졌다. 일행은 소파에 나란히 앉아 얌전히 기다렸다. 얼마 뒤 엘리베이터 문이 열리고 새 점검자들이 내렸다. 접수대 방명록에는 일행의 서명이 수십 줄 가운데 하나로 섞여 있었다. 날짜는 모두 같은 날이다.',
        when: { flag: 'end-sign' },
      },
      {
        text: '모두 더는 움직일 수 없었다. 누군가 소파로 다가와 한 사람씩 조심스럽게 눕혔다. 소파는 일행의 수만큼 늘어나 있었다. 전화가 울렸지만 받을 사람이 없었다.',
        when: { all: [{ panic: 'all' }, { not: { flag: 'end-follow' } }, { not: { flag: 'end-sign' } }] },
      },
      {
        text: '조명이 완전히 꺼졌다. 어둠 속에서 누군가 천천히 일행의 수를 셌다. [[whisper|하나, 둘, 셋.]] 한 번도 서두르지 않았다. 불이 다시 들어왔을 때 소파에는 한 사람이 더 앉아 있었고, 일행은 서로의 얼굴을 알아보지 못했다.',
        when: { all: [{ time: { min: 7 } }, { not: { panic: 'all' } }, { not: { flag: 'end-follow' } }, { not: { flag: 'end-sign' } }] },
      },
    ],
  },
]

export const b7Lobby: Scenario = {
  id: 'b7-lobby',
  code: 'A-02',
  name: 'B7 로비',
  type: 'place',
  party: { min: 2, max: 8 },
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
      unlock: { hint: 'lift-rule' },
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
  items: [
    { id: 'key', name: '점검 열쇠', text: '접수대 서랍에서 찾은 작은 열쇠. 엘리베이터 패널 뚜껑에 맞을 것 같다.' },
    { id: 'loupe', name: '돋보기', text: '손바닥만 한 돋보기. 잉크의 결까지 보인다.' },
    { id: 'torch', name: '청동 손전등', text: '빛이 닿는 곳은 계단이 계단처럼 보인다.' },
  ],
  facts: [
    // 어느 판에서나 같은 사실 (단서 노트에 남는다)
    { id: 'light-cycle', text: '조명은 7분마다 한 단계씩 어두워진다. 마지막 단계는 암전이다.' },
    { id: 'book-date', text: '방명록의 모든 서명은 날짜가 같다.' },
    { id: 'lift-panel-press', text: '엘리베이터 패널 아래 낙서: “누르면 돌아온다.”' },
    { id: 'lift-mirror-hint', text: '엘리베이터 문의 거울에는 일행보다 한 명이 더 비치는 것 같다. (곁눈으로 본 것이라 확실하지 않다)' },
    { id: 'lift-press-back', text: '층 버튼을 누르면 표시등이 B7로 되돌아온다.' },
    { id: 'lift-still-up', text: '아무것도 건드리지 않고 기다리면 층 표시등이 한 칸 올라간다.' },
    { id: 'lift-pair', text: '버튼을 누른 사람 쪽의 표시등만 B7로 되돌아간다. 가만히 서 있던 사람 쪽은 올라간다.' },
    { id: 'lift-sign', text: '문틈의 표지: “아무것도 누르지 않은 사람만 올라갑니다. 거울은 보지 마세요.”' },
    { id: 'lift-no-once', text: '층 버튼은 몇 번을 눌러도 돌아온다.' },
    { id: 'lift-no-mirror', text: '거울을 들여다보면 한 명이 더 나타난다.' },
    { id: 'lift-no-top', text: '가장 높은 층을 눌러도 돌아온다.' },
    { id: 'lift-night-hum', text: '문 안쪽에서 층 표시등이 올라가려는 소리가 난다. 어디선가 버튼 누르는 소리가 날 때마다 그 소리는 처음부터 다시 시작된다.' },
    { id: 'lift-night-scrawl', text: '패널 낙서 위에 덧쓴 글씨: “올라간 사람들은 모두 아무것도 누르지 않았다.”' },
    { id: 'lift-wiring', text: '층 버튼의 선은 모두 한 단자로 묶여 있어서, 어느 버튼을 눌러도 B7로 돌아온다.' },
    { id: 'lift-rule', text: '엘리베이터는 아무 버튼도 누르지 않고 거울도 보지 않은 채 가만히 기다려야 올라간다.' },
    { id: 'sofa-night-first', text: '구겨진 쪽지: “사실은 가장 먼저 쓴 한 장이다. 나중에 쓴 쪽지는 믿지 마라.”' },
    { id: 'stairs-night-skip', text: '계단 아래에서 세는 소리는 매번 마지막 한 칸을 건너뛰고 멎는다.' },
    { id: 'sofa-rule', text: '쪽지 세 장 가운데 사실이 적힌 것은 한 장뿐이고, 그 쪽지는 오래전에 쓰인 것이다.' },
    { id: 'greet-rule', text: '온기가 남은 소파에 “여기 계세요”라고 말해 주면 그것은 따라오지 않는다. 단, 한 곳에만 말해야 한다.' },
    { id: 'stairs-rule', text: '계단은 센 숫자보다 하나 적게 내려가야 한다.' },
    { id: 'phone-count', text: '전화는 인원수를 묻고, 대답을 방명록에 적는다.' },
    { id: 'extra-voice', text: '인원을 소리 내어 세면 어디선가 한 명이 더 대답한다.' },
    { id: 'extra-returns', text: '발소리는 소파에서 시작해 소파로 돌아간다.' },
    // 판마다 바뀌는 값에 대한 사실 (조사 보드에만 붙고 단서 노트에는 남지 않는다)
    ...SOFAS.flatMap(([s]) =>
      (Object.keys(NOTE_POS) as NotePos[]).map((pos) => ({
        id: noteId(s, pos),
        text: `${NOTE_POS[pos]}: “${SOFA_NOTES[s].find((n) => n.pos === pos)!.text}”`,
        run: true,
      })),
    ),
    ...SOFAS.flatMap(([s, label]) => [
      { id: `trace-${s}`, text: TRACE_TEXT[s], run: true },
      {
        id: `lens-${s}`,
        text: `가장 오래된 잉크로 쓰인 글은 “${SOFA_NOTES[s].find((n) => n.holds(s))!.text}”이다. (${NOTE_POS[trueNotePos(s)]})`,
        run: true,
      },
      { id: `ink-${s}`, text: `${NOTE_POS[trueNotePos(s)]}의 잉크만 오래되었다. 나머지 둘은 최근에 쓴 글씨다.`, run: true },
      {
        id: `pair-${s}`,
        text: s === 'a' ? '왼쪽 소파는 따뜻하고, 가운데 소파는 차갑다.' : s === 'b' ? '가운데 소파는 따뜻하고, 왼쪽 소파는 차갑다.' : '왼쪽과 가운데 소파는 둘 다 차갑다.',
        run: true,
      },
      { id: `warm-${s}`, text: `${label} 소파에만 온기가 남아 있다.`, run: true },
      { id: `cold-${s}`, text: `${label} 소파는 차갑다.`, run: true },
    ]),
    ...Object.entries(STAIR_CLUE_TEXT).map(([id, text]) => ({ id, text, run: true })),
    { id: 'echo-low', text: '난간을 튕겨 센 울림으로는 기둥이 열두 개를 넘지 않는다.', run: true },
    { id: 'echo-high', text: '난간을 튕겨 센 울림으로는 기둥이 열두 개를 넘는다.', run: true },
    ...STAIRS.flatMap((n) => [
      { id: `exact-${n}`, text: `난간 기둥은 ${n}개다. (양쪽에서 세어 정확하다)`, run: true },
      { id: `walk-${n}`, text: `${STAIR_STEPS[n]} 칸을 내려가자 계단이 끝났다. (직접 내려가 세었다)`, run: true },
      { id: `wall-${n}`, text: `계단 벽의 눈금에는 “${STAIR_STEPS[n]}”이라고 적혀 있다.`, run: true },
      { id: `torch-${n}`, text: `손전등으로 비춰 세니 난간 기둥은 ${n}개다. (정확하다)`, run: true },
      { id: `no-steps-${n - 1}`, text: `계단은 ${STAIR_STEPS[n]} 칸이 아니다.`, run: true },
    ]),
  ],
  board: {
    goal: '조명이 완전히 꺼지기 전에, 일행 모두가 이 층을 무사히 벗어날 방법을 찾아낸다.',
    questions: built.questions,
  },
  vars: [...built.vars, { id: 'seat', pick: ['a', 'b', 'c'] }, { id: 'stairs', pick: [...STAIRS] }, { id: 'events', pick: [...EVENT_ORDERS] }],
  // 밤이 지나 새 낮이 오면(성공이든 실패든) 시계가 하루 흐른다. 2일째·4일째·6일째에 조명이 한 단계씩 어두워지고, 여드레째에는 암전이다.
  clock: { labels: ['조명이 환하다', '조명이 깜빡인다', '조명이 흐려진다', '조명이 어둡다', '조명이 꺼졌다'], light: true, per: 2, byDay: true },
  deadline: { time: 7, node: 'bad-end' },
  onAllPanic: 'bad-end',
  start: 'arrive',
  nodes: STORY_NODES,
}
