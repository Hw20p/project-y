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
// 추리는 "추리를 시작한다 / 더 조사한다" 둘 중 하나를 고른 뒤 3~4단계의 사슬을 따라간다. 단계마다 모두가 투표하고, 맞으면 근거가 된 단서가
// 이야기로 밝혀지며(그 단서가 없으면 "감"), 틀리면 그 시도가 끝나 오답의 대가와 밤이 이어진다.
//
// 판마다 바뀌는 값: seat(따뜻한 소파 a·b·c), stairs(난간 기둥 수 9·11·13), order(과제 순서),
// events(사건 순서: 발소리가 먼저 fp / 전화가 먼저 ph), risk-<과제>(그 과제에서 위험한 조사).
import { buildTasks, digTwoStep, type ChainStep, type TaskAnswer, type TaskDef, type TaskProbe } from '../../scenario/tasks.ts'
import type { Cond, Node, PersonalOption, Scenario, Text } from '../../scenario/types.ts'

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

// ───────────────────────── 추리 사슬 ─────────────────────────
// 과제마다 3~4단계. 단계마다 근거가 된 단서가 이야기로 밝혀진다 (그 단서를 아무도 얻지 못했으면 "감"이라고 밝힌다).
// 마지막 단계의 보기는 예전의 답(`answers`)과 같아서 오답 기록(`wrongFact`)도 그대로 이어진다.

const knows = (id: string): Cond => ({ knows: id })
const allOf = (...conds: Cond[]): Cond => ({ all: conds })
const anyOf = (...conds: Cond[]): Cond => ({ any: conds })
const not = (cond: Cond): Cond => ({ not: cond })

/** 위에서부터 처음 맞는 근거 하나만 보이는 조각들. 맞는 것이 없으면 `fallback`("감")이 보인다. `base`가 있으면 그 조건에서만 보인다. */
function firstOf(cases: [Cond, string][], fallback: string, base?: Cond): { text: string; when: Cond }[] {
  const pre = base ? [base] : []
  const earlier: Cond[] = []
  const pieces = cases.map(([when, text]) => {
    const piece = { text, when: allOf(...pre, ...earlier.map(not), when) }
    earlier.push(when)
    return piece
  })
  return [...pieces, { text: fallback, when: allOf(...pre, ...earlier.map(not)) }]
}

/**
 * 같은 뜻의 말을 판마다 다르게 보인다: 판이 시작될 때 시드로 뽑힌 `wording`(a·b·c)에 맞는 문구 하나만 나온다.
 * 보기의 **문구로 정답을 외워 두는 것**을 막으려는 장치다 — 뜻과 정답은 그대로이고, 판마다 말투와 고르는 말이 달라진다.
 * 추리 사슬의 보기에 쓴다 (엘리베이터). 정답과 오답을 모두 바꿔야 "아는 문구를 지우고 남는 것"으로 맞힐 수 없다.
 */
const WORDINGS = ['a', 'b', 'c'] as const
const say = (a: string, b: string, c: string): Text => [a, b, c].map((text, i) => ({ text, when: { var: 'wording', is: WORDINGS[i] } }))

/** 틀린 보기의 이야기: 고른 말, 일어난 일, 그리고 시도가 끝났다는 알림 */
const miss = (said: string, what: string): string => `${said}\n${what}\n추리는 여기서 끝났다.`

/** 앞선 오답으로 이미 아니라고 밝혀진 보기를 질문 글에 덧붙인다 */
const questionWith = (base: string, known: [fact: string, label: string][]): Text => [
  { text: base },
  ...known.map(([fact, label]) => ({ text: `\n(이미 아니라고 밝혀졌다: ${label})`, when: knows(fact) })),
]

/** 엘리베이터: 버튼 → 거울 → 문 앞에서 할 일 → 종합 (규칙형) */
function liftChain(): ChainStep[] {
  return [
    {
      question: '추리를 시작한다. 먼저, 층 버튼을 누르면 어떻게 되는가?',
      options: [
        {
          id: 'press-back',
          text: say('누른 층에 가지 못하고 B7로 되돌아온다', 'B7로 돌아와 멈춘다 — 누른 층에는 닿지 못한다', '어느 층을 눌러도 처음 있던 B7로 돌려보내진다'),
          right: true,
        },
        {
          id: 'press-below',
          text: say('누른 층의 바로 아래에서 멈춘다', '누른 층보다 한 층 아래에 닿아 문이 열린다', '목적지 직전인 아래층에서 멎는다'),
          right: false,
          wrong: miss('“누른 층의 바로 아래에서 멈춘다.” 층 표시등을 지켜보았다.', '표시등은 어느 층에서도 멈추지 않았다. 숫자가 [[shake|제멋대로]] 흘렀다.'),
        },
        {
          id: 'press-up',
          text: say('누른 층까지 올라간다', '눌렀던 층에 무사히 닿는다', '버튼대로 그 층까지 올라가 문이 열린다'),
          right: false,
          wrong: miss('“누른 층까지 올라간다.” 층 버튼에 손을 뻗었다.', '버튼에 불이 들어오자 문 안쪽에서 낮은 진동이 일었다. 기대한 대로 되지 않았다.'),
        },
        {
          id: 'press-mirror',
          text: say('누른 층에 닿지만 거울 속 일행이 한 명 늘어난다', '눌렀던 층에는 도착하지만 거울에 비친 사람이 하나 더 는다', '목적지에 닿는 대신 거울 속 일행의 수가 달라진다'),
          right: false,
          wrong: miss('“도착하지만 거울이 달라진다.” 거울에서 눈을 떼지 않고 버튼을 눌렀다.', '거울은 변하지 않았다. 대신 일행의 숨소리가 한 박자 늦게 들렸다.'),
        },
      ],
      ok: firstOf(
        [
          [knows('lift-press-back'), '직접 눌러 본 일이 근거였다. 층 표시등이 B6, B5… 거꾸로 내려가 B7에서 멈췄다. 누르면 돌아온다.'],
          [knows('lift-panel-press'), '패널 아래의 낙서가 근거였다. “누르면 돌아온다.” 눌러 본 흔적이 가득한 버튼이 그 말을 뒷받침했다.'],
          [knows('lift-wiring'), '패널 안쪽 배선이 근거였다. 층 버튼의 선들이 한 단자로 묶여 있다. 어느 버튼을 눌러도 같은 곳으로 돌아오게 되어 있다.'],
          [knows('lift-pair'), '둘이 시험한 결과가 근거였다. 버튼을 누른 사람 쪽의 표시등만 B7로 되돌아갔다.'],
        ],
        '버튼을 눌렀을 때의 일을 말해 주는 기록은 없었다. 근거 없이 감이 닿았을 뿐이다. 그래도 문 안쪽이 낮게 웅웅거리는 것 같았다.',
      ),
    },
    {
      question: '거울 같은 문은 어떻게 해야 하는가?',
      options: [
        {
          id: 'mirror-skip',
          text: say('거울은 보지 않는다 — 곁눈으로도 훑지 않는다', '거울 쪽으로는 눈을 주지 않는다 — 흘깃 보는 것도 하지 않는다', '문의 거울을 아예 외면한다 — 곁눈질도 하지 않는다'),
          right: true,
        },
        {
          id: 'mirror-side',
          text: say('정면으로는 보지 않고 곁눈으로만 훑는다', '똑바로는 안 보되 흘깃흘깃 곁눈으로 살핀다', '정면은 피하고 눈꼬리로만 거울을 확인한다'),
          right: false,
          wrong: miss('“곁눈으로만 보면 괜찮다.” 거울을 비스듬히 훑었다.', '비친 일행 사이에서 누군가 천천히 고개를 돌렸다. [[shake|눈이 마주쳤다.]]'),
        },
        {
          id: 'mirror-count',
          text: say('거울로 일행의 수를 확인한다', '거울에 비친 일행을 세어 인원을 맞춰 본다', '비친 모습으로 일행이 다 있는지 헤아려 본다'),
          right: false,
          wrong: miss('“거울로 확인하자.” 비친 일행을 한 명씩 세어 보았다.', '[[shake|하나가 더 있었다.]] 비친 사람은 이쪽을 보고 있지 않았다. 확인할수록 틀어진다.'),
        },
        {
          id: 'mirror-talk',
          text: say('거울 속의 사람에게 말을 걸어 본다', '거울에 비친 누군가에게 먼저 말을 건넨다', '거울 속 상대를 불러 대답을 기다려 본다'),
          right: false,
          wrong: miss('“말을 걸어 보자.” 거울 앞에서 낮게 불러 보았다.', '거울 속의 누군가가 입 모양으로 같은 말을 따라 했다. [[shake|소리 없이, 한 박자 늦게.]] 아무도 두 번 부르지 못했다.'),
        },
      ],
      ok: firstOf(
        [
          [knows('lift-sign'), '문틈의 표지가 근거였다. “거울은 보지 마세요.” 거울을 보면 안 되는 이유가 있는 것이다.'],
          [knows('lift-no-mirror'), '거울로 일행을 세어 보았다가 [[shake|하나가 더]] 있음을 본 기록이 근거였다. 거울은 보지 않는 편이 낫다.'],
          [knows('lift-mirror-hint'), '곁눈으로 훑어본 일이 근거였다. 비친 일행이 한 명 더 많은 것 같았다. 오래 보고 싶지 않은 느낌이 그 증거다.'],
        ],
        '거울에 대한 기록은 없었다. 근거 없이 감이 닿았을 뿐이다. 그래도 거울 쪽에서는 시선을 느끼지 않으려 애쓰게 된다.',
      ),
    },
    {
      question: '그렇다면 문 앞에서 무엇을 해야 위로 올라가는가?',
      options: [
        {
          id: 'wait-still',
          text: say('아무것도 건드리지 않고 가만히 기다린다', '손대지 않고 문 앞에서 조용히 서 있는다', '아무 데도 누르지 않은 채 그대로 기다린다'),
          right: true,
        },
        {
          id: 'wait-split',
          text: say('한 명이 먼저 눌러 보고, 나머지는 따라간다', '대표로 한 사람이 버튼을 눌러 보고 나머지는 뒤따른다', '한 사람이 시험 삼아 누르면 나머지가 이어서 탄다'),
          right: false,
          wrong: miss('“한 명이 먼저 누르고 나머지가 따라가자.” 한 사람이 버튼을 눌렀다.', '일행이 갈라졌다. 누른 사람은 로비로 돌아왔고 나머지는 한 칸 올라가다 멈췄다.'),
        },
        {
          id: 'wait-rush',
          text: say('문이 닫히기 전에 서둘러 모두 탄다', '문이 닫히기 전에 다 같이 얼른 안으로 들어간다', '닫히기 전에 일행 모두 서둘러 올라탄다'),
          right: false,
          wrong: miss('“서둘러 타자.” 모두 문 안으로 뛰어들었다.', '문은 열린 채 그대로였다. 거친 숨소리가 거울 속에서 [[shake|두 배로]] 들렸다.'),
        },
        {
          id: 'wait-count',
          text: say('일행의 수를 소리 내어 센다', '일행이 모두 있는지 큰 소리로 하나씩 센다', '인원수를 소리 내어 확인한다'),
          right: false,
          wrong: miss('“인원을 소리 내어 세어 보자.” 한 명씩 숫자를 불렀다.', '숫자가 하나 더 불려 나왔다. 아무도 그 목소리를 낸 적이 없었다.'),
        },
      ],
      ok: firstOf(
        [
          [knows('lift-still-up'), '가만히 서 있던 일이 근거였다. 아무도 버튼을 누르지 않았는데 층 표시등이 한 칸 올라갔다.'],
          [knows('lift-night-scrawl'), '낙서 위에 덧쓴 글씨가 근거였다. “올라간 사람들은 모두 아무것도 누르지 않았다.”'],
          [knows('lift-sign'), '표지가 근거였다. “아무것도 누르지 않은 사람만 올라갑니다.”'],
          [knows('lift-night-hum'), '문 안쪽의 소리가 근거였다. 올라가려는 낮은 소리는 누가 버튼을 누를 때마다 끊겼다. 누르지 않으면 끊기지 않는다.'],
          [knows('lift-pair'), '둘이 시험한 결과가 근거였다. 가만히 서 있던 사람 쪽만 한 칸 올라갔다.'],
        ],
        '가만히 있는 쪽이 어떤지 말해 주는 기록은 없었다. 근거 없이 감이 닿았을 뿐이다.',
      ),
    },
    {
      // 이미 아니라고 밝혀진 보기는 이번 판에 보이는 문구(`wording`)와 같은 말로 덧붙인다
      question: [
        { text: '종합한다. 이 엘리베이터를 어떻게 해야 위로 올라가는가?' },
        ...(
          [
            ['lift-no-once', '버튼을 한 번만 가볍게 누른다', '버튼을 딱 한 번만 살짝 누른다', '버튼 하나를 가볍게 한 번 누른다'],
            ['lift-no-mirror', '거울로 일행의 수를 확인한다', '거울로 일행 수를 헤아린다', '거울로 인원을 확인한다'],
            ['lift-no-top', '가장 높은 층(B1) 버튼을 끝까지 누른다', '가장 위층인 B1 버튼을 꾹 눌러 둔다', '맨 위층 B1 버튼을 끝까지 꾹 누른다'],
          ] as const
        ).flatMap(([fact, ...labels]) =>
          labels.map((label, i) => ({ text: `\n(이미 아니라고 밝혀졌다: ${label})`, when: allOf(knows(fact), { var: 'wording', is: WORDINGS[i] }) })),
        ),
      ],
      options: [
        {
          id: 'once',
          text: say('거울은 보지 않고, 층 버튼을 한 번만 가볍게 누른다', '거울을 외면한 채, 층 버튼을 딱 한 번만 살짝 누른다', '거울은 안 보고, 버튼 하나를 가볍게 한 번 누른다'),
          right: false,
          wrong:
            '층 버튼 하나를 눌렀다. 표시등이 거꾸로 내려가더니 B7에서 멈췄다. 되돌아온 것이다.\n한 번이든 여러 번이든, 누르면 돌아오는 모양이다.',
          wrongFact: 'lift-no-once',
        },
        {
          id: 'still',
          text: say(
            '버튼은 누르지 않고, 거울도 보지 않은 채 문이 닫히기를 기다린다',
            '버튼에 손대지 않고, 거울도 외면한 채 문이 닫히길 기다린다',
            '아무 버튼도 누르지 않고 거울도 보지 않으며 문이 닫히기만 기다린다',
          ),
          right: true,
        },
        {
          id: 'mirror',
          text: say(
            '버튼은 누르지 않고, 거울로 일행의 수를 확인한 뒤 기다린다',
            '버튼은 건드리지 않되, 거울로 일행 수를 헤아린 다음 기다린다',
            '아무 버튼도 누르지 않지만 거울로 인원을 확인하고 기다린다',
          ),
          right: false,
          wrong: '거울 속에서 일행을 한 명씩 세어 보았다. [[shake|하나가 더 있었다.]] 그 사람은 이쪽을 보고 있지 않았다.\n눈을 돌린 뒤에도 한참 동안 시선이 따가웠다.',
          wrongFact: 'lift-no-mirror',
        },
        {
          id: 'top',
          text: say('거울은 보지 않고, 가장 높은 층(B1) 버튼을 끝까지 누른다', '거울을 외면한 채, 가장 위층인 B1 버튼을 꾹 눌러 둔다', '거울은 안 보고, 맨 위층 B1 버튼을 끝까지 꾹 누른다'),
          right: false,
          wrong: 'B1 버튼에 불이 들어왔다. 엘리베이터는 한참을 내려가더니 같은 로비에 같은 소리로 문이 열렸다.\n어느 층을 누르든 돌아오는 것이다.',
          wrongFact: 'lift-no-top',
        },
      ],
      ok: '누르면 돌아오고, 거울은 보면 안 되고, 가만히 있으면 올라간다. 세 가지가 같은 방향을 가리킨다.',
    },
  ]
}

/** 소파: 사실 쪽지의 수 → 그 쪽지는 어느 것 → 그 쪽지가 말하는 것 → 따뜻한 소파 (모순형) */
function sofaChain(): ChainStep[] {
  const POS = Object.keys(NOTE_POS) as NotePos[]
  /** 사실이 적힌 쪽지가 "차갑다"고 말하는 소파 (모든 자리에서 사실 쪽지는 차가운 쪽을 하나 말한다) */
  const coldSaid: Record<SeatId, SeatId> = { a: 'b', b: 'c', c: 'a' }
  return [
    {
      question: '추리를 시작한다. 먼저, 쪽지 세 장 가운데 사실이 적힌 것은 몇 장인가?',
      options: [
        { id: 'notes-one', text: '한 장뿐이다', right: true },
        {
          id: 'notes-all',
          text: '세 장 모두 사실이다',
          right: false,
          wrong: miss('“세 장 모두 믿을 수 있다.” 쪽지 셋의 말을 모두 받아들여 보았다.', '말들이 서로 맞지 않았다. 모두가 사실일 수는 없다.'),
        },
        {
          id: 'notes-two',
          text: '두 장이 사실이고 한 장이 거짓이다',
          right: false,
          wrong: miss('“거짓은 한 장뿐이다.” 가장 수상한 쪽지 한 장을 치웠다.', '남은 두 장의 말도 서로 맞지 않았다. 쪽지는 [[whisper|그렇게 넉넉하지 않다.]]'),
        },
        {
          id: 'notes-none',
          text: '믿을 만한 쪽지는 한 장도 없다',
          right: false,
          wrong: miss('“믿을 쪽지는 없다.” 쪽지를 모두 접어 치우려 했다.', '접수대 위 안내판의 불빛이 한 번 깜빡였다.'),
        },
      ],
      ok: firstOf(
        [
          [knows('sofa-rule'), '접수대의 안내판이 근거였다. “사실이 적힌 쪽지는 그중 한 장뿐이며, 오래전에 쓰인 것입니다.”'],
          [knows('sofa-night-first'), '쓰레기통의 구겨진 쪽지가 근거였다. “사실은 가장 먼저 쓴 한 장이다.” 한 장뿐이라는 말이다.'],
        ],
        '이 규칙을 말해 주는 기록은 읽지 못했다. 근거 없이 감이 닿았을 뿐이다.',
      ),
    },
    {
      question: '사실이 적힌 한 장은 어느 쪽지인가?',
      options: POS.map(
        (pos): TaskAnswer => ({
          id: `true-${pos}`,
          text: NOTE_POS[pos],
          right: anyOf(...SOFAS.filter(([s]) => trueNotePos(s) === pos).map(([s]) => seatIs(s))),
          wrong: miss(`“${NOTE_POS[pos]}” 쪽을 믿고 한 걸음 나섰다.`, '그 말을 따르자 다른 쪽지와 [[shake|앞뒤가 맞지 않았다.]] 믿어서는 안 되는 쪽지였다.'),
        }),
      ),
      ok: SOFAS.flatMap(([s]) =>
        firstOf(
          [
            [anyOf(knows(`ink-${s}`), knows(`lens-${s}`)), `잉크가 근거였다. 세 쪽지 가운데 “${NOTE_POS[trueNotePos(s)]}”의 잉크만 오래되어 갈색으로 바래 있었다.`],
            [
              allOf(...POS.map((pos) => knows(noteId(s, pos)))),
              `세 쪽지를 나란히 놓고 따져 본 것이 근거였다. 사실이 한 장뿐이라는 규칙에 맞는 조합은 “${NOTE_POS[trueNotePos(s)]}”가 사실일 때 하나뿐이었다.`,
            ],
          ],
          '어느 쪽지가 사실인지 가려 줄 단서는 아직 없었다. 근거 없이 감이 닿았을 뿐이다.',
          seatIs(s),
        ),
      ),
    },
    {
      question: '사실로 믿을 수 있는 그 쪽지는 무엇을 말하는가?',
      options: SOFAS.map(
        ([id, label]): TaskAnswer => ({
          id: `says-cold-${id}`,
          text: `${label} 소파는 차갑다`,
          right: anyOf(...SOFAS.filter(([s]) => coldSaid[s] === id).map(([s]) => seatIs(s))),
          wrong: miss(`“${label} 소파는 차갑다.” 그렇게 정리하고 ${label} 소파 쪽을 보았다.`, '그런데 사실인 쪽지는 그 소파에 대해 아무 말도 하지 않는다. 정리가 어긋났다.'),
        }),
      ),
      ok: SOFAS.flatMap(([s]) => {
        const real = SOFA_NOTES[s].find((n) => n.holds(s))!
        return firstOf(
          [[knows(noteId(s, real.pos)), `${NOTE_POS[real.pos]}에 적힌 글이 근거였다. “${real.text}” 이 한 줄은 믿어도 된다.`]],
          '그 쪽지는 읽지 못했다. 근거 없이 감이 닿았을 뿐이다.',
          seatIs(s),
        )
      }),
    },
    {
      question: questionWith(
        '종합한다. 거짓인 두 쪽지는 사실의 반대를 말한다. 온기가 남은 소파는 어느 쪽인가?',
        SOFAS.map(([id, label]): [string, string] => [`cold-${id}`, `${label} 소파`]),
      ),
      options: SOFAS.map(
        ([id, label]): TaskAnswer => ({
          id: `sofa-${id}`,
          text: `${label} 소파다`,
          right: seatIs(id),
          wrong: `${label} 소파 앞에 서서 낮게 말했다. “여기 계세요.”\n그쪽은 [[cold|차가웠다.]] 말은 허공에 떨어졌고, 다른 쪽에서 무언가 일어서는 소리가 났다.\n이 소파는 아니다.`,
          wrongFact: `cold-${id}`,
        }),
      ),
      ok: SOFAS.flatMap(([s, label]) =>
        firstOf(
          [
            [knows(`warm-${s}`), `세 소파를 차례로 만져 본 손이 근거였다. ${label} 소파만 방금까지 누가 앉았던 것처럼 따뜻했다.`],
            [knows(`trace-${s}`), `카펫의 눌린 자국이 근거였다. 다른 두 소파 앞은 말끔하고 ${label} 소파 앞에만 사람이 오래 서 있던 느낌이 남아 있었다.`],
            [
              knows(`pair-${s}`),
              s === 'a'
                ? '둘이 동시에 만져 본 결과가 근거였다. 왼쪽만 따뜻하고 가운데는 차가웠다.'
                : s === 'b'
                  ? '둘이 동시에 만져 본 결과가 근거였다. 가운데만 따뜻하고 왼쪽은 차가웠다.'
                  : '둘이 동시에 만져 본 결과가 근거였다. 왼쪽도 가운데도 차가웠으니 남는 곳은 오른쪽이다.',
            ],
          ],
          '직접 확인한 단서는 없었다. 쪽지의 규칙대로 거짓 쪽지를 뒤집어 본 추론이다. 근거는 그것뿐이다.',
          seatIs(s),
        ),
      ),
    },
  ]
}

/** 계단: 센 숫자와 칸 수의 관계 → 기둥 수 → 내려갈 칸 수 (수치형) */
function stairsChain(): ChainStep[] {
  return [
    {
      question: '추리를 시작한다. 먼저, 세어서 얻은 숫자와 내려가야 할 칸 수는 어떤 관계인가?',
      options: [
        { id: 'rel-less', text: '센 숫자보다 하나 적게 내려가야 끝이 있다', right: true },
        {
          id: 'rel-same',
          text: '센 숫자만큼 내려가면 끝이다',
          right: false,
          wrong: miss('“센 숫자만큼이다.” 기둥 수만큼 칸을 세며 내려갔다.', '끝에 닿았다고 생각한 칸 아래로 계단이 [[shake|한 칸 더]] 이어졌다. 서둘러 올라왔다.'),
        },
        {
          id: 'rel-more',
          text: '센 숫자보다 하나 많이 내려가야 한다',
          right: false,
          wrong: miss('“하나 더 내려가야 한다.” 기둥 수보다 한 칸 더 내려갔다.', '끝은 이미 지나쳐 있었다. 발끝이 닿은 곳은 로비와 똑같은 로비였고, 소파가 [[shake|하나 더]] 있었다.'),
        },
        {
          id: 'rel-half',
          text: '센 숫자의 절반만 내려가면 된다',
          right: false,
          wrong: miss('“절반이면 된다.” 반쯤 내려가다 멈춰 섰다.', '계단은 아직 한참 남아 있었다. 올라오는 길에 아래의 숫자 소리가 바싹 따라붙었다.'),
        },
      ],
      ok: firstOf(
        [
          [knows('stairs-rule'), '계단 입구의 안내판이 근거였다. “센 숫자보다 하나 적게 내려가야 끝이 있습니다.”'],
          [knows('stairs-night-skip'), '아래에서 올라오는 숫자가 근거였다. 숫자는 매번 마지막 한 칸을 건너뛰고 멎는다. 그 빈칸만큼 하나가 적다.'],
        ],
        '이 관계를 말해 주는 기록은 읽지 못했다. 근거 없이 감이 닿았을 뿐이다.',
      ),
    },
    {
      question: '난간 기둥은 모두 몇 개인가?',
      options: STAIRS.map(
        (n): TaskAnswer => ({
          id: `pillars-${n}`,
          text: `${n}개다`,
          right: stairsIs(n),
          wrong: miss(`“${n}개다.” 그 수에 맞춰 칸을 가늠해 보았다.`, '계단 아래에서 숫자 세는 소리가 [[shake|한 박자]] 어긋났다. 기둥 수가 맞지 않는다.'),
        }),
      ),
      ok: STAIRS.flatMap((n) => {
        const [c1, c2] = STAIR_CLUES[n]
        return firstOf(
          [
            [anyOf(knows(`torch-${n}`), knows(`exact-${n}`)), `직접 센 값이 근거였다. 기둥은 모두 ${n}개다. 틀림없다.`],
            [
              allOf(knows(c1.id), knows(c2.id)),
              `두 가지 어림이 근거였다. ${STAIR_CLUE_TEXT[c1.id]} ${STAIR_CLUE_TEXT[c2.id]} 두 범위를 겹치면 남는 수는 ${n}뿐이다.`,
            ],
            [anyOf(knows(`walk-${n}`), knows(`wall-${n}`)), `내려가 본 칸 수와 벽의 눈금이 근거였다. 거기서 하나 더해 거꾸로 세면 기둥은 ${n}개다.`],
            [anyOf(knows(c1.id), knows(c2.id)), '어림 하나가 후보를 둘로 좁혀 주었고, 그 안에서 짚었다. 근거는 반쪽뿐이다.'],
          ],
          '기둥 수를 좁혀 줄 단서는 모이지 않았다. 근거 없이 감이 닿았을 뿐이다.',
          stairsIs(n),
        )
      }),
    },
    {
      question: questionWith(
        '종합한다. 계단은 몇 칸을 내려가야 끝에 닿는가?',
        STAIRS.map((n): [string, string] => [`no-steps-${n - 1}`, `${STAIR_STEPS[n]} 칸`]),
      ),
      options: STAIRS.map(
        (n): TaskAnswer => ({
          id: `s${n - 1}`,
          text: `${STAIR_STEPS[n]} 칸이다`,
          right: stairsIs(n),
          wrong: `${STAIR_STEPS[n]} 칸을 내려왔는데도 계단은 이어졌다. 발밑이 한 칸 사라지는 느낌에 서둘러 올라왔다.\n이 숫자가 아니다. 올라오는 동안 모두의 무릎이 후들거렸다.`,
          wrongFact: `no-steps-${n - 1}`,
        }),
      ),
      ok: STAIRS.flatMap((n) =>
        firstOf(
          [[anyOf(knows(`walk-${n}`), knows(`wall-${n}`)), `기둥은 ${n}개이니 하나 적게 — ${STAIR_STEPS[n]} 칸이다. 직접 내려가 본 칸 수와 벽의 눈금도 같은 값을 가리켰다.`]],
          `기둥은 ${n}개이니 하나 적게 — ${STAIR_STEPS[n]} 칸이다.`,
          stairsIs(n),
        ),
      ),
    },
  ]
}

// ───────────────────────── 과제 ─────────────────────────

const lift: TaskDef = {
  id: 'lift',
  title: '엘리베이터',
  period: 'day',
  place: 'lift',
  intro:
    '닫힌 엘리베이터 문 앞에 모였다. 문은 거울처럼 매끈하고, 층 표시등은 B6에서 멈춰 있다. 패널에는 내려가는 층 버튼뿐이다.\n이 문을 어떻게 해야 위로 올라가는지 알아내야 한다. 문은 열린 채 일행을 기다리고 있으니, 그 앞에서 조심스럽게 시험해 볼 수 있다.',
  probes: [
    {
      id: 'panel',
      text: '패널 아래의 낙서를 읽는다',
      tier: 1,
      risk: '낙서를 읽는 동안 패널 안쪽에서 달각, 하고 무언가 버튼을 눌러 보는 소리가 났다. 안쪽에서. 손끝이 얼어붙어 한참을 움직일 수 없었다.',
      findings: [{ text: '패널 아래에 낙서가 있다. 몇 겹으로 긁혀 있어서 한눈에 읽히지 않는다.' }],
      dig: digTwoStep('scrawl', {
        first: {
          text: '긁힌 자국이 겹쳐 있다. 어느 줄부터 읽을까?',
          good: '가장 깊게 파인 줄부터 손끝으로 따라 읽는다',
          bad: '가장 알아보기 쉬운 얕은 줄부터 읽는다',
          badEnd: '얕은 줄은 최근에 장난으로 그은 선이었다. 의미를 읽어 내지 못했다.',
        },
        second: {
          text: '깊은 줄이 글씨로 이어진다. 어떻게 읽을까?',
          good: '글씨를 처음부터 끝까지 소리 내지 않고 읽는다',
          bad: '글씨의 모양만 본떠 그려 본다',
          badEnd: '모양만 따라 그리다 보니 뜻을 놓쳤다.',
          badFirst: true,
        },
        clue: [
          {
            result: '층 버튼에는 눌러 본 흔적이 가득하다. 패널 아래에 누군가 낙서를 남겼다. “누르면 돌아온다.”',
            effects: [learn('lift-panel-press')],
          },
        ],
      }),
    },
    {
      id: 'glance',
      text: '문의 거울을 정면으로 보지 않고 곁눈으로 훑는다',
      tier: 1,
      risk: '곁눈질이 길어졌다. 거울 속 일행 사이에서 누군가 천천히 고개를 돌려 이쪽을 똑바로 보았다. [[shake|눈이 마주쳤다.]] 시선을 돌리자 거울은 다시 평범해졌다.',
      findings: [{ text: '거울 같은 문을 정면으로 보지 않고 곁눈으로 훑어보기로 했다. 눈이 자꾸 정면으로 돌아가려 한다.' }],
      dig: digTwoStep('glance', {
        first: {
          text: '거울 쪽으로 눈이 끌린다. 어떻게 볼까?',
          good: '시선을 문틀 가장자리에 두고 곁눈으로만 일행의 수를 가늠한다',
          bad: '잠깐만 정면으로 확인한다',
          badEnd: '정면으로 보는 순간 거울 속 누군가와 눈이 마주칠 뻔했다. 서둘러 눈을 돌렸지만 아무것도 알아내지 못했다.',
          badFirst: true,
        },
        second: {
          text: '거울 속에 일행이 비친다. 얼마나 볼까?',
          good: '한 번만 훑고 곧바로 눈을 돌린다',
          bad: '자꾸 눈이 가는 곳을 끝까지 따라간다',
          badEnd: '시선이 길어졌다. 눈을 돌렸을 때는 본 것이 이미 흐려져 있었다.',
        },
        clue: [
          {
            result: '거울을 똑바로 보지 않고 곁눈으로만 훑었다. 비친 일행이 한 명 더 많은 것 같다. 확실하지는 않다. 오래 보고 싶지 않은 느낌이 든다.',
            effects: [learn('lift-mirror-hint')],
          },
        ],
      }),
    },
    {
      // 낙서와 같은 단서에 이르는 다른 길 (대가는 없다). 둘이 나눠 맡으면 같은 것을 두 번 얻는 셈이 된다.
      id: 'buttons',
      text: '층 버튼에 배어 있는 손때를 살핀다',
      tier: 1,
      findings: [{ text: '층 버튼에 배어 있는 손때를 살피기로 했다. 버튼마다 닳은 정도가 조금씩 다르다.' }],
      dig: digTwoStep('grime', {
        first: {
          text: '버튼이 여럿이다. 무엇을 비교할까?',
          good: '닳은 정도를 버튼마다 비교한다',
          bad: '가장 반짝이는 버튼 하나만 본다',
          badEnd: '반짝이는 버튼은 새로 닦은 것이었다. 알 수 있는 것이 없다.',
        },
        second: {
          text: '닳은 정도가 비슷하다. 무엇을 더 확인할까?',
          good: '버튼 곁에 긁혀 있는 글씨를 읽는다',
          bad: '버튼 숫자의 순서를 외운다',
          badEnd: '숫자는 B6부터 B1까지 평범했다. 알아낸 것이 없다.',
          badFirst: true,
        },
        clue: [
          {
            result:
              '층 버튼마다 손때가 깊게 배어 있다. 누르고 또 눌러서 닳은 흔적인데, 닳은 정도가 모두 비슷하다. 어느 층을 눌렀든 결국 같은 곳으로 돌아왔다는 듯이.\n버튼 곁에 누군가 손톱으로 새겨 둔 글씨가 있다. “누르면 돌아온다.”',
            effects: [learn('lift-panel-press')],
          },
        ],
      }),
    },
    {
      // 알아낼 것이 없는 곳: 한 라운드에 한 곳만 살필 수 있으므로 여기를 고르면 그만큼 놓친다.
      id: 'ceiling',
      text: '문 위의 층 표시등과 천장 등을 올려다본다',
      tier: 1,
      findings: [
        {
          text: '층 표시등은 B6에서 멈춰 있고, 천장 등은 일정한 박자로 깜빡인다. 박자가 숨소리를 닮았다. 한참을 올려다보았지만 알아낼 만한 것은 없었다.',
        },
      ],
    },
    {
      // 아이템은 낮의 조사에서만 얻는다. 이미 누가 열쇠를 가졌으면 이 곳은 보이지 않는다.
      id: 'keyring',
      text: '접수대 뒤 벽에 걸린 열쇠 꾸러미를 살핀다',
      tier: 1,
      when: { not: { item: 'key' } },
      findings: [
        {
          text: '벽에 열쇠 꾸러미가 걸려 있다. 대부분 녹슬어 맞는 곳이 없어 보이는데, 하나에만 “점검용”이라고 적힌 꼬리표가 달려 있다. 끝이 닳았다. 챙겼다.',
          effects: [{ give: 'key', to: 'actor' }],
        },
      ],
    },
    {
      id: 'press',
      text: '층 버튼 하나를 눌러 본다 (문은 열어 둔 채)',
      tier: 2,
      risk: '버튼이 눌린 순간 문 안쪽에서 무언가 마주 손바닥을 댔다. 차가운 진동이 손가락뼈를 타고 어깨까지 올라왔다. 한동안 손이 제 것 같지 않았다.',
      findings: [{ text: '층 버튼을 눌러 보기로 했다. 문이 닫히지 않게 한 발은 문턱에 걸쳐 둔다. 손가락이 어느 버튼 위에서 멈췄다.' }],
      dig: digTwoStep('press', {
        first: {
          text: '어느 버튼을 눌러 볼까? 문 안으로 들어갈지도 정해야 한다.',
          good: '문을 열어 둔 채, 가장 가까운 층 버튼을 가볍게 한 번 누른다',
          bad: '문 안으로 들어가 가장 높은 층(B1) 버튼을 끝까지 누른다',
          badEnd: '버튼에 불이 들어오는 순간 문이 등 뒤에서 닫혔다. 서둘러 문틈에 발을 끼웠지만 한참이 지난 뒤였다. 아무것도 알아내지 못했다.',
        },
        second: {
          text: '버튼에 불이 들어왔다. 층 표시등이 움직이기 시작한다. 어디를 볼까?',
          good: '표시등의 숫자가 어떻게 변하는지 끝까지 따라간다',
          bad: '버튼 쪽만 보며 손가락이 닿은 자리를 확인한다',
          badEnd: '버튼만 보느라 표시등을 놓쳤다. 무슨 일이 있었는지는 알 수 없다.',
          badFirst: true,
        },
        clue: [
          {
            result: '층 표시등이 B6, B5… 거꾸로 내려가더니 B7에서 멈췄다. 되돌아온 것이다. 문은 열린 채였지만 등줄기가 서늘했다.',
            effects: [learn('lift-press-back')],
            later: sanityLater(1),
          },
        ],
      }),
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
      findings: [{ text: '열쇠가 패널 뚜껑에 꼭 맞았다. 뚜껑 안쪽은 어두워서 선들이 뒤엉켜 보인다.' }],
      dig: digTwoStep('panel', {
        first: {
          text: '선이 어지럽게 얽혀 있다. 어떻게 살펴볼까?',
          good: '손끝으로 선 하나를 골라 끝까지 따라간다',
          bad: '가장 굵은 선 하나를 잡아당겨 본다',
          badEnd: '굵은 선을 당기자 패널 안에서 불꽃이 튀었다. 손을 뗐을 때는 눈앞이 번쩍거려 아무것도 보이지 않았다.',
          badFirst: true,
        },
        second: {
          text: '선이 어디론가 모이는 것이 느껴진다. 무엇을 확인할까?',
          good: '모든 선이 어디로 이어지는지 하나씩 세어 본다',
          bad: '모이는 곳의 겉만 눈으로 훑는다',
          badEnd: '겉만 보아서는 알 수 없었다. 어둠 속에서 손만 헛돌았다.',
        },
        clue: [
          {
            result: '층 버튼의 선들이 모두 한 단자로 묶여 있다. 어느 버튼을 눌러도 같은 곳으로 돌아오게 되어 있다.',
            effects: [learn('lift-wiring')],
          },
        ],
      }),
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
        // 밤에는 아이템을 얻을 수 없고, 가진 아이템을 쓰는 선택지만 있다. 열쇠는 낮의 조사(열쇠 꾸러미)에서 얻는다.
        id: 'panel-night',
        text: '혼자 점검 열쇠로 패널 뚜껑을 열고 안쪽 배선을 살핀다',
        when: { all: [{ item: 'key', by: 'actor' }, { not: { knows: 'lift-wiring' } }] },
        result:
          '밤의 로비는 조용했다. 열쇠로 패널 뚜껑을 열고 안쪽을 더듬어 살폈다. 층 버튼의 선들이 모두 한 단자로 묶여 있다. 어느 버튼을 눌러도 같은 곳으로 돌아오게 되어 있다.',
        effects: [learn('lift-wiring')],
      },
    ],
  },
  hazard: [{ stat: 'sanity', add: -3, to: 'actor' }],
  question: '이 엘리베이터를 어떻게 해야 위로 올라가는가?',
  chain: liftChain(),
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
  place: 'sofa',
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
        findings: [{ text: `${NOTE_POS[pos]}에 쪽지가 있다. 오래되어 글씨가 흐리다. 읽어 보기로 했다.` }],
        dig: digTwoStep(`memo-${pos}`, {
          first: {
            text: '쪽지의 글씨가 흐리다. 어떻게 읽을까?',
            good: '쪽지를 평평히 펴고 글씨를 한 줄씩 따라 읽는다',
            bad: '글자 몇 개만 훑고 뜻을 짐작한다',
            badEnd: '짐작한 뜻은 이내 흐려졌다. 정확히 무슨 말인지 읽어 내지 못했다.',
            badFirst: pos === 'book',
          },
          second: {
            text: '문장이 이어진다. 끝까지 확인한다.',
            good: '마지막 글자까지 읽고 처음으로 돌아가 한 번 더 맞춰 본다',
            bad: '앞의 한 줄만 믿고 쪽지를 덮는다',
            badEnd: '한 줄만으로는 뜻이 바뀐다. 쪽지를 덮고 나서야 마지막 줄이 중요했을 것 같았다.',
            badFirst: pos !== 'book',
          },
          clue: SOFAS.map(([s]) => ({
            when: seatIs(s),
            result: `${NOTE_POS[pos]}에는 이렇게 적혀 있다. “${SOFA_NOTES[s].find((n) => n.pos === pos)!.text}”`,
            effects: [learn(noteId(s, pos))],
          })),
        }),
      }),
    ),
    {
      id: 'notice',
      text: '접수대 위의 작은 안내판을 읽는다',
      tier: 1,
      findings: [{ text: '접수대 위에 작은 안내판이 서 있다. 글씨가 작고 빽빽하다.' }],
      dig: digTwoStep('notice', {
        first: {
          text: '안내판의 글씨가 빽빽하다. 어떻게 읽을까?',
          good: '첫 줄부터 끝까지 차례로 읽는다',
          bad: '굵게 쓴 줄만 읽는다',
          badEnd: '굵은 줄은 인사말뿐이었다. 본문은 읽지 못했다.',
          badFirst: true,
        },
        second: {
          text: '본문에 쪽지 이야기가 나온다. 무엇을 확인할까?',
          good: '쪽지 가운데 사실이 몇 장인지, 그 쪽지가 어떤지를 따져 읽는다',
          bad: '안내판의 테두리 장식을 본다',
          badEnd: '장식은 낡은 꽃무늬였다. 알아낸 것이 없다.',
        },
        clue: [
          {
            result: '접수대 위에 작은 안내판이 서 있다. “쪽지는 세 장 남겨 두었습니다. 사실이 적힌 쪽지는 그중 한 장뿐이며, 그 쪽지는 오래전에 쓰인 것입니다.”',
            effects: [learn('sofa-rule')],
          },
        ],
      }),
    },
    {
      // 알아낼 것이 없는 곳: 한 라운드에 한 곳만 살필 수 있으므로 여기를 고르면 그만큼 놓친다.
      id: 'frame',
      text: '벽에 걸린 낡은 액자를 들여다본다',
      tier: 1,
      findings: [
        {
          text: '액자 속 사진에는 이 로비가 찍혀 있다. 소파는 세 개, 사람은 보이지 않는다. 오래 보고 있으니 사진 속 소파 하나가 방금 움직인 것 같았다. 착각이다. 알아낼 만한 것은 없었다.',
        },
      ],
    },
    {
      // 아이템은 낮의 조사에서만 얻는다. 이미 누가 돋보기를 가졌으면 이 곳은 보이지 않는다.
      id: 'shelf',
      text: '접수대 곁 선반의 상자를 열어 본다',
      tier: 1,
      when: { not: { item: 'loupe' } },
      findings: [
        {
          text: '선반 구석의 먼지 없는 상자 안에 손바닥만 한 돋보기가 놓여 있었다. 렌즈에는 지문 하나 묻어 있지 않다. 챙겼다.',
          effects: [{ give: 'loupe', to: 'actor' }],
        },
      ],
    },
    {
      id: 'ink',
      text: '쪽지들의 잉크를 비교해 본다',
      tier: 2,
      risk: '쪽지를 겹쳐 들여다보던 손가락이 종이 모서리에 베였다. 얇은 상처에서 피가 배어 나와 쪽지 한 장에 번졌는데, 번진 자국은 금세 마른 잉크처럼 검게 변했다.',
      findings: [{ text: '쪽지 세 장을 겹쳐 잉크를 비교하기로 했다. 세 쪽지의 글씨가 비슷해서 쉽지 않다.' }],
      dig: digTwoStep('ink', {
        first: {
          text: '글씨가 서로 비슷하다. 무엇부터 비교할까?',
          good: '스탠드 불빛 아래에서 잉크의 가장자리를 비교한다',
          bad: '글씨체가 닮은 것끼리 묶어 본다',
          badEnd: '글씨체는 세 장이 모두 비슷했다. 한참을 들여다보았지만 가려내지 못했다.',
        },
        second: {
          text: '잉크의 가장자리가 보인다. 무엇을 기준으로 가를까?',
          good: '바랜 정도와 번진 정도를 겹쳐 본다',
          bad: '글자의 크기를 비교한다',
          badEnd: '크기는 모두 같았다. 알아낸 것이 없다.',
          badFirst: true,
        },
        clue: SOFAS.map(([s]) => ({
          when: seatIs(s),
          result: `세 쪽지의 잉크를 가까이서 비교했다. ${NOTE_POS[trueNotePos(s)]}의 잉크만 오래되어 갈색으로 바랬다. 나머지 둘은 최근에 쓴 글씨다.`,
          effects: [learn(`ink-${s}`)],
        })),
      }),
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
      findings: [{ text: '돋보기를 들고 쪽지 세 장을 펼쳤다. 렌즈 너머로 잉크의 결이 보이기 시작한다.' }],
      dig: digTwoStep('lens', {
        first: {
          text: '렌즈를 어떻게 쓸까?',
          good: '렌즈를 쪽지에 바짝 붙이고 글자 하나의 획을 따라간다',
          bad: '렌즈를 멀리 두고 쪽지 전체를 한 번에 본다',
          badEnd: '전체를 보려 하니 아무것도 또렷하지 않았다. 렌즈 너머가 어지럽다.',
          badFirst: true,
        },
        second: {
          text: '획의 끝이 보인다. 어디에서 확인할까?',
          good: '세 쪽지의 획 끝이 번진 모양을 차례로 비교한다',
          bad: '가장 반듯한 글씨의 쪽지 하나만 본다',
          badEnd: '한 장만 보아서는 비교할 수 없었다. 알아낸 것이 없다.',
        },
        clue: SOFAS.map(([s]) => {
          const real = SOFA_NOTES[s].find((n) => n.holds(s))!
          return {
            when: seatIs(s),
            result: `돋보기로 쪽지들의 잉크를 들여다보았다. 가장 오래된 잉크로 쓰인 글은 “${real.text}”이다. (${NOTE_POS[real.pos]})`,
            effects: [learn(`lens-${s}`)],
          }
        }),
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
      // 밤에는 아이템을 얻을 수 없고, 가진 아이템을 쓰는 선택지만 있다. 돋보기는 낮의 조사(선반의 상자)에서 얻는다.
      ...SOFAS.map(([s]) => {
        const real = SOFA_NOTES[s].find((n) => n.holds(s))!
        return {
          id: `lens-night-${s}`,
          text: '혼자 돋보기로 쪽지들의 잉크를 들여다본다',
          when: allOf(seatIs(s), { item: 'loupe', by: 'actor' }, not(knows(`lens-${s}`))),
          result: `밤의 로비에서 돋보기로 쪽지들의 잉크를 들여다보았다. 가장 오래된 잉크로 쓰인 글은 “${real.text}”이다. (${NOTE_POS[real.pos]})`,
          effects: [learn(`lens-${s}`)],
        }
      }),
    ],
  },
  hazard: [{ hurt: 'actor' }],
  question: '온기가 남은 소파는 어느 쪽인가?',
  chain: sofaChain(),
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

/** 파티 누군가 `<접두>-<기둥 수>` 단서를 이미 알아냈는지 */
const knowsAnyStairs = (prefix: string): Cond => anyOf(...STAIRS.map((n) => knows(`${prefix}-${n}`)))
/** 스텟 기준선: 필수 길이 아니라 같은 단서를 더 일찍(밤을 덜 겪고) 얻는 지름길이다. 3은 전문가는 처음부터, 균형형은 밤 훈련 한 번이면 닿는 선이다. */
const bodyGate = { cond: { stat: 'body', min: 3, by: 'actor' } as Cond, locked: '체력 3 이상이 필요하다. 튼튼한 다리로 흔들림 없이 내려가야 한다.' }
const insightGate = { cond: { stat: 'insight', min: 3, by: 'actor' } as Cond, locked: '관찰 3 이상이 필요하다. 어둠 속에서도 기둥을 놓치지 않아야 한다.' }

const stairs: TaskDef = {
  id: 'stairs',
  title: '계단',
  period: 'day',
  place: 'stairs',
  intro:
    '계단 입구에 모였다. 난간 기둥이 어둠 속으로 이어진다. 계단 아래에서 누군가 천천히 숫자를 센다. [[whisper|하나… 둘… 셋…]]\n몇 칸을 내려가야 끝에 닿는지 알아내야 한다.',
  probes: [
    {
      id: 'feel',
      text: '어둠 속에서 난간 기둥을 손으로 더듬어 센다',
      tier: 1,
      risk: '기둥을 세다가 손바닥이 난간 이음매의 녹슨 쇠 조각에 깊이 긁혔다. 어둠 속이라 얼마나 다쳤는지 보이지 않았지만, 따뜻한 것이 손목을 타고 흘렀다.',
      findings: [{ text: '어둠 속에서 난간 기둥을 손으로 더듬어 세기로 했다. 손끝이 떨려서 정확하지는 않을 것이다.' }],
      dig: digTwoStep('feel', {
        first: {
          text: '기둥이 어둠 속으로 이어진다. 어떻게 셀까?',
          good: '난간 한쪽에서 시작해 기둥을 하나씩 천천히 짚으며 센다',
          bad: '손바닥으로 훑으며 빠르게 센다',
          badEnd: '빠르게 훑다 보니 몇 개를 놓쳤는지도 모르겠다. 센 값을 믿을 수 없다.',
        },
        second: {
          text: '기둥이 끝났다. 센 값을 어떻게 할까?',
          good: '처음 센 곳으로 돌아와 한 번 더 센다',
          bad: '센 값을 곧장 머릿속에 새기고 손을 뗀다',
          badEnd: '확인하지 않은 숫자는 금세 흐려졌다.',
          badFirst: true,
        },
        clue: STAIRS.map((n) => ({
          when: stairsIs(n),
          result: `어둠 속에서 손으로 더듬으며 난간 기둥을 셌다. 손끝이 떨려서 정확하지는 않다.\n${STAIR_CLUE_TEXT[STAIR_CLUES[n][0].id]}`,
          effects: [learn(STAIR_CLUES[n][0].id)],
          later: sanityLater(1),
        })),
      }),
    },
    {
      id: 'half',
      text: '난간 한쪽의 절반만 세고 두 배로 어림해 본다',
      tier: 1,
      findings: [{ text: '난간 한쪽의 기둥만 세고 두 배로 어림해 보기로 했다.' }],
      dig: digTwoStep('half', {
        first: {
          text: '기둥이 한쪽에 줄지어 있다. 먼저 무엇을 볼까?',
          good: '기둥 사이의 간격이 같은지 먼저 확인하고 센다',
          bad: '눈대중으로 한쪽 기둥 수를 센다',
          badEnd: '간격이 일정한지도 모른 채 센 숫자는 어림조차 되지 않았다.',
          badFirst: true,
        },
        second: {
          text: '한쪽을 다 셌다. 두 배로 어림하려 한다.',
          good: '끝 기둥이 겹치는지 따져서 두 배로 한다',
          bad: '센 값에 곧장 2를 곱한다',
          badEnd: '끝 기둥을 두 번 센 것인지 알 수 없다. 어림이 어긋났다.',
        },
        clue: STAIRS.map((n) => ({
          when: stairsIs(n),
          result: `난간 한쪽의 기둥만 세고 두 배로 어림해 보았다. 대략의 값이다.\n${STAIR_CLUE_TEXT[STAIR_CLUES[n][1].id]}`,
          effects: [learn(STAIR_CLUES[n][1].id)],
        })),
      }),
    },
    {
      id: 'torch',
      text: '손전등으로 비추며 난간 기둥을 하나씩 센다',
      tier: 1,
      when: { item: 'torch', by: 'actor' },
      findings: [{ text: '청동 손전등으로 비추며 난간 기둥을 하나씩 세기로 했다. 빛이 닿는 곳은 계단이 계단처럼 보인다.' }],
      dig: digTwoStep('torch', {
        first: {
          text: '빛이 난간을 따라 번진다. 어떻게 비출까?',
          good: '빛을 난간 위에서 아래로 한 기둥씩 옮긴다',
          bad: '빛을 넓게 퍼뜨려 한꺼번에 본다',
          badEnd: '넓게 비추니 기둥이 겹쳐 보였다. 세다가 포기했다.',
        },
        second: {
          text: '기둥이 하나씩 드러난다. 어떻게 셀까?',
          good: '센 기둥의 수를 손가락으로 표시하며 센다',
          bad: '머릿속으로만 센다',
          badEnd: '숫자를 놓쳐 어디까지 셌는지 알 수 없었다.',
          badFirst: true,
        },
        clue: STAIRS.map((n) => ({
          when: stairsIs(n),
          result: `청동 손전등으로 비추며 난간 기둥을 하나씩 세었다. 모두 ${n}개다. 틀림없다.`,
          effects: [learn(`torch-${n}`)],
        })),
      }),
    },
    {
      id: 'sign',
      text: '계단 입구의 낡은 안내판을 읽는다',
      tier: 1,
      findings: [{ text: '계단 입구에 낡은 안내판이 붙어 있다. 글씨가 많이 바랬다.' }],
      dig: digTwoStep('sign', {
        first: {
          text: '글씨가 바래서 잘 보이지 않는다. 어떻게 읽을까?',
          good: '안내판을 비스듬히 비추어 바랜 글씨를 읽는다',
          bad: '글씨가 또렷한 맨 위 제목만 읽는다',
          badEnd: '제목은 “주의” 두 글자뿐이었다. 본문은 읽지 못했다.',
        },
        second: {
          text: '본문이 이어진다. 무엇을 찾을까?',
          good: '숫자와 관련된 말이 나올 때까지 끝까지 읽는다',
          bad: '앞부분만 읽고 넘긴다',
          badEnd: '숫자에 대한 말이 어디에 있었는지 놓쳤다.',
          badFirst: true,
        },
        clue: [
          {
            result: '계단 입구에 낡은 안내판이 붙어 있다. “계단은 세는 사람의 수만큼 길어집니다. 센 숫자보다 하나 적게 내려가야 끝이 있습니다.”',
            effects: [learn('stairs-rule')],
          },
        ],
      }),
    },
    {
      // 알아낼 것이 없는 곳: 한 라운드에 한 곳만 살필 수 있으므로 여기를 고르면 그만큼 놓친다.
      id: 'handrail',
      text: '난간의 칠이 벗겨진 자리를 살핀다',
      tier: 1,
      findings: [
        {
          text: '난간은 같은 자리마다 칠이 벗겨져 검게 닳아 있다. 수없이 많은 손이 잡고 내려간 흔적이다. 올라온 손자국은 거의 없다. 기둥 수나 칸 수에 대해서는 알려 주는 것이 없다.',
        },
      ],
    },
    {
      // 아이템은 낮의 조사에서만 얻는다. 이미 누가 손전등을 가졌으면 이 곳은 보이지 않는다.
      id: 'rack',
      text: '계단 입구 벽의 쇠고리를 살핀다',
      tier: 1,
      when: { not: { item: 'torch' } },
      findings: [
        {
          text: '벽의 쇠고리에 청동 손전등이 걸려 있다. 만져 보니 아직 따뜻하다. 방금까지 누군가 쥐고 있었던 것처럼. 챙겼다.',
          effects: [{ give: 'torch', to: 'actor' }],
        },
      ],
    },
    {
      // 체력 지름길: 2단계 '직접 내려가 세기'와 같은 단서를 첫날에, 파고들기·정신력 대가 없이 얻는다. `risk`가 없어서 위험한 곳으로 뽑히지 않는다.
      id: 'stride',
      text: '난간을 잡고 성큼성큼 내려가며 칸을 센다',
      tier: 1,
      needsHealthy: true,
      gate: bodyGate,
      when: not(knowsAnyStairs('walk')),
      findings: byStairs((n) => ({
        text: `숫자 소리에 맞추지 않고 내 걸음으로 칸을 세며 내려갔다. 다리가 흔들리지 않았다. ${STAIR_STEPS[n]} 칸에서 계단이 끝났다. 끝에는 로비와 똑같은 로비가 있었다. 서둘러 되짚어 올라왔다.`,
        effects: [learn(`walk-${n}`)],
      })),
    },
    {
      // 관찰 지름길: 2단계 '양쪽에서 세기'와 같은 단서를 혼자서, 첫날에 얻는다.
      id: 'keen',
      text: '기둥의 이음매와 간격을 눈여겨보며 한 번에 센다',
      tier: 1,
      gate: insightGate,
      when: not(anyOf(knowsAnyStairs('exact'), knowsAnyStairs('torch'))),
      findings: byStairs((n) => ({
        text: `기둥의 이음매와 간격을 하나하나 눈에 새기며 세었다. 같은 기둥을 두 번 세지 않았다. 기둥은 모두 ${n}개다. 틀림없다.`,
        effects: [learn(`exact-${n}`)],
      })),
    },
    {
      id: 'both',
      text: '두 사람이 난간 양쪽에서 동시에 센다',
      tier: 2,
      min: 2,
      needsHealthy: true,
      when: not(knowsAnyStairs('exact')),
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
      when: not(knowsAnyStairs('walk')),
      risk: '되짚어 올라오는 길에 발밑의 한 칸이 사라진 것처럼 푹 꺼졌다. 난간을 잡았지만 발목이 크게 꺾였다. 올라와서 보니 그 칸은 원래 자리에 멀쩡히 있었다.',
      findings: [{ text: '난간을 잡고 계단을 내려가 보기로 했다. 아래에서 숫자 세는 소리가 점점 가까워진다.' }],
      dig: digTwoStep('walk', {
        first: {
          text: '숫자 소리가 발걸음 사이로 파고든다. 어떻게 셀까?',
          good: '숫자 소리에 맞추지 않고 내 걸음으로 칸을 센다',
          bad: '숫자 소리에 맞춰 함께 센다',
          badEnd: '소리에 맞춰 세다 보니 어느새 내 숫자가 아니었다. 몇 칸을 내려왔는지 알 수 없다.',
          badFirst: true,
        },
        second: {
          text: '끝이 보이는 듯하다. 어떻게 돌아갈까?',
          good: '내려온 칸 수를 속으로 되뇌며 천천히 되짚어 올라간다',
          bad: '서둘러 뛰어 올라간다',
          badEnd: '뛰어 오르느라 센 숫자를 놓쳤다.',
        },
        clue: STAIRS.map((n) => ({
          when: stairsIs(n),
          result: `칸을 세며 조심스럽게 내려갔다. ${STAIR_STEPS[n]} 칸에서 계단이 끝났다. 끝에는 로비와 똑같은 로비가 있었다. 서둘러 되짚어 올라왔다.`,
          effects: [learn(`walk-${n}`)],
          later: sanityLater(2),
        })),
      }),
    },
    {
      id: 'wall',
      text: '계단 벽에 새겨진 눈금을 읽는다',
      tier: 3,
      risk: '눈금을 더듬어 읽던 손가락이 벽의 날카로운 홈에 걸려 손톱이 갈라졌다. 벽이 손가락을 놓아 주기 전까지 아주 짧게, 안쪽에서 무언가 당기는 느낌이 있었다.',
      findings: [{ text: '계단 벽에 눈금 같은 것이 새겨져 있다. 어둠 속이라 손으로 더듬어 읽기로 했다.' }],
      dig: digTwoStep('wall', {
        first: {
          text: '눈금이 길게 이어진다. 어디부터 읽을까?',
          good: '눈금의 맨 아래에서부터 위로 올라가며 읽는다',
          bad: '눈에 띄는 큰 홈부터 읽는다',
          badEnd: '큰 홈은 누군가의 낙서였다. 읽을수록 손가락만 아프다.',
        },
        second: {
          text: '맨 아래 눈금 옆에 작은 글씨가 있는 듯하다. 어떻게 읽을까?',
          good: '손끝으로 글씨의 홈을 따라 읽는다',
          bad: '눈으로만 훑는다',
          badEnd: '어둠 속에서는 눈으로 읽을 수 없었다.',
          badFirst: true,
        },
        clue: STAIRS.map((n) => ({
          when: stairsIs(n),
          result: `계단 벽에 오래된 눈금이 새겨져 있다. 맨 아래 눈금 옆에 작은 글씨가 있다. “${STAIR_STEPS[n]}.”`,
          effects: [learn(`wall-${n}`)],
        })),
      }),
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
      // 밤에는 아이템을 얻을 수 없고, 가진 아이템을 쓰는 선택지만 있다. 손전등은 낮의 조사(쇠고리)에서 얻는다.
      ...STAIRS.map((n) => ({
        id: `torch-night-${n}`,
        text: '혼자 손전등으로 비추며 난간 기둥을 하나씩 센다',
        when: allOf(stairsIs(n), { item: 'torch', by: 'actor' }, not(knows(`torch-${n}`))),
        result: `밤의 계단에서 청동 손전등으로 비추며 난간 기둥을 하나씩 세었다. 모두 ${n}개다. 틀림없다.`,
        effects: [learn(`torch-${n}`)],
      })),
    ],
  },
  hazard: [{ hurt: 'actor' }],
  question: '계단은 몇 칸을 내려가야 끝에 닿는가?',
  chain: stairsChain(),
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
    place: 'lobby',
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
    place: 'lobby',
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
    place: 'lobby',
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
    place: 'lobby',
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
    place: 'lobby',
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
    place: 'lift',
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
    place: 'stairs',
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
    place: 'lobby',
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
    fx: 'phantom',
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
    { id: 'torch', name: '청동 손전등', text: '빛이 닿는 곳은 계단이 계단처럼 보인다.', light: true },
  ],
  facts: [
    // 어느 판에서나 같은 사실
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
    // 판마다 바뀌는 값에 대한 사실 (조사 보드에 붙는다)
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
      { id: `exact-${n}`, text: `난간 기둥은 ${n}개다. (정확히 세었다)`, run: true },
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
  vars: [
    ...built.vars,
    { id: 'seat', pick: ['a', 'b', 'c'] },
    { id: 'stairs', pick: [...STAIRS] },
    { id: 'events', pick: [...EVENT_ORDERS] },
    // 추리 사슬 보기의 문구 (뜻은 같다). `say`를 보라.
    { id: 'wording', pick: [...WORDINGS] },
  ],
  // 밤이 지나 새 낮이 오면(성공이든 실패든) 시계가 하루 흐른다. 2일째·4일째·6일째에 조명이 한 단계씩 어두워지고, 여드레째에는 암전이다.
  clock: { labels: ['조명이 환하다', '조명이 깜빡인다', '조명이 흐려진다', '조명이 어둡다', '조명이 꺼졌다'], light: true, per: 2, byDay: true },
  deadline: { time: 7, node: 'bad-end' },
  onAllPanic: 'bad-end',
  start: 'arrive',
  nodes: STORY_NODES,
}
