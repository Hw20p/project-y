// A-03 거래하는 자판기 — 혼자서도, 여럿이서도 할 수 있는 대상 (정원 1~8명).
//
// 진실: 지하 2층 휴게실의 자판기는 "거래"한다. 오늘 받는 것은 정해져 있고(품목), 눌러야 할 칸도 정해져 있다(버튼).
// 거스름돈은 받는 순간 빚이 되고, 도로 넣으면 거래가 처음부터 다시 시작된다. 그래서 거스름돈은 그대로 두고 떠나야 한다.
// 올바른 거래: ① 오늘 받는 품목을 넣고 ② 오늘의 버튼을 누르고 ③ 거스름돈에 손대지 않는다.
// 정전으로 잠긴 문은 이 거래가 끝나야 열린다. 마지막 새벽이 오면 자판기는 장부를 정산하고, 정산되지 않은 것은 가져간다.
//
// 시간: 도입과 세 과제(조사·추리)는 낮이고, 사건·휴식과 오답·패스 뒤는 밤이다. 오답이나 패스를 하면 하루가 지나 밤이 오고
// 오염이 한 칸 오른다(5칸이 차면 마지막 새벽의 정산). 화면에는 "n일째 낮/밤"이 보인다 (B7과 같은 틀).
//
// 과제 셋을 하나씩, 판마다 다른 순서로 푼다. 과제마다 추리가 다르다:
//   받는 것 — 순서형: 자판기는 어제 받은 것의 다음 것을 받는다. 순서 규칙과 어제의 기록을 합쳐 오늘을 구한다.
//             추리는 4단계 사슬이다(규칙 → 도는 방향 → 어제 → 오늘). 단계마다 근거가 된 단서가 이야기로 밝혀지고, 틀리면 그 시도가 끝난다.
//   버튼 — 대응형: 버튼 아래 전선 세 가닥(빨강·파랑·초록)이 칸 세 곳에 이어져 있고, 눌러야 할 칸은 초록 선이 닿은 칸이다. 단서를 맞춰 짝을 찾는다.
//   거스름돈 — 장부형: 행동마다 장부가 어떻게 변하는지 모아, 거래가 닫히는(합이 0이 되고 처음으로 돌아가지 않는) 행동을 고른다.
// 과제 사이에는 사건(혼자 울리는 소리·자판기의 목소리)과 잠깐의 휴식(개인 행동)이 있다. 오답·패스는 시계(오염 — 자판기의 푸른 불빛이 번져 방이 물든다)를 한 칸 올리고, 화면이 그만큼 어두워지며, 시계가 끝에 닿으면 정산된다.
// 혼자(1명)도 할 수 있어서 둘이 해야 열리는 조사에는 같은 정보를 혼자 얻는 대체 조사(정신력이 든다)가 있다.
// 글은 '나'나 '당신'을 쓰지 않아 혼자일 때도 여럿일 때도 자연스럽다.
//
// 판마다 바뀌는 값: price(받는 품목 coin·photo·badge), button(눌러야 할 칸 A·B·C), wires(전선이 이어진 방식 1·2), order(과제 순서).
import { buildTasks, digTwoStep, type ChainStep, type TaskAnswer, type TaskDef, type TaskProbe } from '../../scenario/tasks.ts'
import type { Cond, Effect, Node, PersonalOption, Scenario } from '../../scenario/types.ts'

/** 주머니 속 세 가지 (오늘 자판기가 받는 것은 이 중 하나). 순서가 곧 자판기가 받는 순서다. */
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
export type ItemId = (typeof ITEMS)[number][0]
export type ButtonId = (typeof BUTTONS)[number][0]
export type WiresId = '1' | '2'

const ITEM_ORDER: ItemId[] = ['coin', 'photo', 'badge']
const BUTTON_ORDER: ButtonId[] = ['A', 'B', 'C']
const itemLabel = (id: ItemId) => ITEMS.find(([x]) => x === id)![1]
const buttonLabel = (id: ButtonId) => BUTTONS.find(([x]) => x === id)![1]

/** 순서에서 `step`칸 뒤 */
const nextOf = <T extends string>(order: readonly T[], from: T, step: number): T => order[(order.indexOf(from) + step) % order.length]
/** 어제 받은 것: 오늘 받는 것의 바로 앞 */
export const yesterdayOf = (price: ItemId): ItemId => nextOf(ITEM_ORDER, price, 2)

/** 전선이 이어진 방식: 초록은 눌러야 할 칸에 닿고, 빨강은 나머지 두 칸 중 `wires`가 정하는 쪽, 파랑은 남은 칸에 닿는다 */
export function wiringOf(button: ButtonId, wires: WiresId): { green: ButtonId; red: ButtonId; blue: ButtonId } {
  const others = BUTTON_ORDER.filter((b) => b !== button)
  const red = wires === '1' ? others[0] : others[1]
  return { green: button, red, blue: others.find((b) => b !== red)! }
}

const priceIs = (id: ItemId): Cond => ({ var: 'price', is: id })
const buttonIs = (id: ButtonId): Cond => ({ var: 'button', is: id })

type Findings = TaskProbe['findings']
const learn = (id: string) => ({ learn: id, to: 'actor' as const })
const sanityLater = (n: number) => [{ stat: 'sanity' as const, add: -n, to: 'actor' as const }]

/** 오늘 받는 것에 따라 발견이 다르다 (마지막 조각은 조건 없이 둔다) */
const byPrice = (make: (price: ItemId) => Findings[number]): Findings =>
  ITEM_ORDER.map((p, i) => ({ ...make(p), ...(i < ITEM_ORDER.length - 1 ? { when: priceIs(p) } : {}) }))

/** 단계형 조사에서, 눌러야 할 칸과 전선 방식(여섯 가지)마다 맞게 끝냈을 때 얻는 단서가 다르다 (판마다 하나만 보인다) */
const wiringClues = (
  make: (w: ReturnType<typeof wiringOf>) => { result: string; effects: Effect[]; later?: Effect[] },
): { when: Cond; result: string; effects: Effect[]; later?: Effect[] }[] =>
  BUTTON_ORDER.flatMap((b) =>
    (['1', '2'] as const).map((wr) => ({ when: { all: [buttonIs(b), { var: 'wires', is: wr }] } as Cond, ...make(wiringOf(b, wr)) })),
  )

/** 눌러야 할 칸과 전선 방식에 따라 발견이 다르다 */
const byWiring = (make: (w: ReturnType<typeof wiringOf>) => Findings[number]): Findings => {
  const cases = BUTTON_ORDER.flatMap((b) => (['1', '2'] as const).map((w) => ({ b, w })))
  return cases.map(({ b, w }, i) => ({
    ...make(wiringOf(b, w)),
    ...(i < cases.length - 1 ? { when: { all: [buttonIs(b), { var: 'wires', is: w }] } as Cond } : {}),
  }))
}

type NightMake = Pick<PersonalOption, 'result' | 'effects' | 'later'>
/**
 * 오늘 받는 것에 따라 결과가 다른 밤 선택지. 문구는 같고 경우마다 하나만 보여서 고르는 사람이 답을 짐작하지 못한다.
 * 이미 파티 누군가 그 단서를 알아냈으면 숨긴다.
 */
const byPriceNight = (id: string, text: string, fact: (p: ItemId) => string, make: (p: ItemId) => NightMake): PersonalOption[] =>
  ITEM_ORDER.map((p) => ({ id: `${id}-${p}`, text, when: { all: [priceIs(p), { not: { knows: fact(p) } }] }, ...make(p) }))
/** 밤에는 아이템을 얻을 수 없다. 가진 아이템을 쓰는 선택지는 그 아이템을 가진 사람에게만 보인다. */
const withItem =
  (item: string) =>
  (o: PersonalOption): PersonalOption => ({ ...o, when: { all: [{ item, by: 'actor' }, ...(o.when ? [o.when] : [])] } as Cond })
/** 눌러야 할 칸과 전선 방식에 따라 결과가 다른 밤 선택지 (위와 같다) */
const byWiringNight = (id: string, text: string, fact: (w: ReturnType<typeof wiringOf>) => string, make: (w: ReturnType<typeof wiringOf>) => NightMake): PersonalOption[] =>
  BUTTON_ORDER.flatMap((b) =>
    (['1', '2'] as const).map((w) => {
      const wi = wiringOf(b, w)
      return { id: `${id}-${b}${w}`, text, when: { all: [buttonIs(b), { var: 'wires', is: w }, { not: { knows: fact(wi) } }] } as Cond, ...make(wi) }
    }),
  )

// ───────────────────────── 과제 ─────────────────────────

const SLOT_TEXT: Record<ItemId, string> = {
  coin: '투입구 가장자리의 긁힌 자국은 모두 길고 얇다. 둥글고 작은 것이 지나간 흔적은 하나도 없다. 낡은 동전은 이 입구가 받지 않는 모양이다.',
  photo: '투입구 안쪽 가장자리에 종이가 스친 흔적이 하나도 없다. 얇은 종이는 이 입구가 받지 않는 모양이다. 가족사진은 아니다.',
  badge: '투입구에는 단단한 플라스틱 모서리가 꽂힌 자국이 하나도 없다. 사원증처럼 딱딱한 것은 받지 않는 모양이다.',
}
const SHAPE: Record<ItemId, string> = { coin: '작고 둥근 홈', photo: '얇고 긴 홈', badge: '두껍고 단단한 홈' }

/**
 * 받는 것의 추리 사슬: 규칙 → 도는 방향 → 어제 → 오늘. 보기는 판마다 순서가 섞이고, 틀린 보기도 그럴듯하다.
 * 단계마다 근거가 된 단서가 이야기로 밝혀진다 (그 단서를 아무도 얻지 못했으면 "감").
 */
function itemChain(): ChainStep[] {
  const knows = (id: string): Cond => ({ knows: id })
  const no = (id: string): Cond => ({ not: knows(id) })
  const all = (...conds: Cond[]): Cond => ({ all: conds })
  const miss = (what: string, why: string) => `${what}\n표시등이 [[shake|붉게]] 깜빡였다. ${why}\n추리는 여기서 끝났다.`

  return [
    {
      question: '추리를 시작한다. 먼저, 자판기는 받는 것을 어떤 규칙으로 정하는가?',
      options: [
        { id: 'rule-cycle', text: '정해진 순서가 있다 — 하루에 하나씩, 한 바퀴를 돌면 처음으로 돌아온다', right: true },
        {
          id: 'rule-random',
          text: '그날그날 무작위다',
          right: false,
          wrong: miss('“무작위다.” 주머니에서 아무것이나 꺼내 투입구 앞에 댔다.', '무작위로 짚어서는 이 기계가 받아 주지 않는다.'),
        },
        {
          id: 'rule-same',
          text: '늘 같은 것만 받는다',
          right: false,
          wrong: miss('“늘 같은 것이다.” 가장 만만한 것을 내밀었다.', '투입구가 입을 꾹 다물었다. 그렇게 단순한 기계가 아니다.'),
        },
        {
          id: 'rule-price',
          text: '값나가는 것부터 차례로 빼앗는다',
          right: false,
          wrong: miss('“값나가는 것부터다.” 가장 귀한 것을 먼저 내밀었다.', '자판기는 값을 매기지 않는다. 기대한 대로 되지 않았다.'),
        },
        {
          id: 'rule-mood',
          text: '표시등의 색에 따라 다르다',
          right: false,
          wrong: miss('“표시등의 색을 따른다.” 불빛이 바뀌기를 기다렸다.', '표시등은 처음부터 끝까지 같은 푸른색이었다. 기다린 시간만 흘렀다.'),
        },
      ],
      ok: [
        {
          text: '낙서가 근거였다. 날짜 옆에 품목이 한 글자씩, 동전·사진·사원증이 같은 순서로 되풀이되고 있었다. 무작위가 아니다. 자판기는 순서대로 돈다.',
          when: knows('item-cycle'),
        },
        {
          text: '낙서의 품목이 같은 순서로 되풀이되는 것을 읽은 것이 근거였다. 무작위가 아니다. 자판기는 순서대로 돈다.',
          when: all(knows('item-cycle-half'), no('item-cycle')),
        },
        {
          text: '이 규칙을 말해 주는 기록은 읽지 못했다. 근거 없이 감이 닿았을 뿐이다. 그래도 자판기는 낮게 ‘응’ 하고 대답하는 것 같았다.',
          when: all(no('item-cycle'), no('item-cycle-half')),
        },
      ],
    },
    {
      question: '순서가 있다면, 어느 쪽으로 도는가?',
      options: [
        { id: 'dir-up', text: '가벼운 것에서 소중한 것으로 — 동전, 사진, 사원증, 다시 동전', right: true },
        {
          id: 'dir-down',
          text: '소중한 것에서 가벼운 것으로 — 사원증, 사진, 동전, 다시 사원증',
          right: false,
          wrong: miss('“소중한 것부터 내려간다.” 사원증부터 차례를 따졌다.', '투입구가 어긋난 박자로 달각거렸다. 순서를 잘못 짚었다.'),
        },
        {
          id: 'dir-mine',
          text: '거래하는 사람이 가장 아끼는 것부터',
          right: false,
          wrong: miss('“가장 아끼는 것부터다.” 주머니 속에서 가장 아끼는 것을 쥐었다.', '자판기는 사람의 마음을 읽지 않는다.'),
        },
        {
          id: 'dir-alpha',
          text: '품목 이름의 가나다 순서',
          right: false,
          wrong: miss('“이름 순서다.” 이름을 소리 내어 읽으며 차례를 매겼다.', '표시등이 깜빡이기만 했다. 이름은 이 기계에 아무 의미가 없다.'),
        },
      ],
      ok: [
        {
          text: '낙서 아래에 누군가 크게 적어 둔 글이 근거였다. “가벼운 것에서 소중한 것으로.” 동전 다음은 사진, 사진 다음은 사원증, 사원증 다음은 다시 동전이다.',
          when: knows('item-cycle'),
        },
        { text: '순서의 방향을 알려 주는 글은 읽지 못했다. 이것도 감이다.', when: no('item-cycle') },
      ],
    },
    {
      question: '그렇다면 어제 이 자판기가 받은 것은 무엇인가?',
      options: ITEMS.map(
        ([id, label]): TaskAnswer => ({
          id: `yd-${id}`,
          text: `${label}이다`,
          right: priceIs(nextOf(ITEM_ORDER, id, 1)),
          wrong: miss(`어제 받은 것은 ${label}이었다고 짚었다.`, '어제의 기록은 그렇게 말하지 않는다. 어제를 잘못 짚으면 오늘도 틀린다.'),
        }),
      ),
      ok: ITEM_ORDER.flatMap((p) => {
        const y = itemLabel(yesterdayOf(p))
        return firstOf2(
          [
            [knows(`yday-${p}`), `영수증이 근거였다. 맨 윗줄에 어제 날짜의 거래가 한 줄 찍혀 있었다. “어제: ${y}.” 어제 자판기가 받은 것은 ${y}이다.`],
            [knows(`night-last-${p}`), `벽 맨 위쪽, 가장 최근 날짜 옆의 글씨가 근거였다. 어제 거래한 사람이 남긴 글씨다. “${y}.” 어제 자판기가 받은 것은 ${y}이다.`],
          ],
          '어제의 기록은 어디서도 찾지 못했다. 이것은 근거가 아니라 감이다. 그런데도 이상하게 확신이 든다.',
          priceIs(p),
        )
      }),
    },
    {
      question: [
        { text: '순서는 가벼운 것에서 소중한 것으로 돌고, 어제 받은 것도 알았다. 그렇다면 오늘 자판기가 받는 것은?' },
        // 투입구 소리·자국이나 앞선 오답으로 이미 아니라고 밝혀진 것은 질문에 덧붙는다
        ...ITEM_ORDER.map((x) => ({ text: `\n(${itemLabel(x)}은 이미 아니라고 밝혀졌다.)`, when: knows(`no-item-${x}`) })),
      ],
      options: ITEMS.map(
        ([id, label]): TaskAnswer => ({
          id: `item-${id}`,
          text: `${label}이다`,
          right: priceIs(id),
          wrong: `투입구 앞에 ${label}을 가져다 댔다. 넣지는 않았다.\n표시등이 [[shake|붉게]] 깜빡였고 투입구가 잠깐 오므라들었다. 손끝이 차가워졌다.\n이것은 아니다. 하마터면 손가락째 삼켜질 뻔했다.`,
          wrongFact: `no-item-${id}`,
        }),
      ),
      // 풀이(solved) 앞에 붙는다: 결론이 어디서 나왔는지, 다른 단서가 있었다면 그것도 맞아떨어졌는지
      ok: ITEM_ORDER.flatMap((p) => [
        {
          text: `어제가 ${itemLabel(yesterdayOf(p))}이었고 순서는 가벼운 것에서 소중한 것으로 돈다. 그다음 차례는 ${itemLabel(p)}이다.`,
          when: priceIs(p),
        },
        { text: ' 장부의 오늘 줄도 같은 이름을 가리킨다.', when: all(priceIs(p), knows(`ledger-${p}`)) },
        { text: ' 투입구 안쪽의 홈 모양도 맞는다.', when: all(priceIs(p), knows(`today-${p}`)) },
      ]),
    },
  ]
}

/** 위에서부터 처음 맞는 근거 하나만 보이는 조각들 (맞는 것이 없으면 `fallback`). `base`가 있으면 그 조건에서만 보인다. */
function firstOf2(cases: [Cond, string][], fallback: string, base?: Cond): { text: string; when: Cond }[] {
  const pre = base ? [base] : []
  const earlier: Cond[] = []
  const pieces = cases.map(([when, text]) => {
    const piece = { text, when: { all: [...pre, ...earlier.map((c): Cond => ({ not: c })), when] } as Cond }
    earlier.push(when)
    return piece
  })
  return [...pieces, { text: fallback, when: { all: [...pre, ...earlier.map((c): Cond => ({ not: c }))] } as Cond }]
}

const item: TaskDef = {
  id: 'item',
  title: '받는 것',
  period: 'day',
  place: 'item',
  intro:
    '투입구에는 “무엇이든 넣으세요”라고 적혀 있다. 하지만 아무거나 넣어서는 안 된다는 것쯤은 알 수 있다. 오늘 이 기계가 받는 것은 하나로 정해져 있다.\n주머니에는 낡은 동전, 가족사진, 사원증이 들어 있다. 무엇을 받는지 알아내야 한다.',
  probes: [
    {
      // 단계형 조사: 고른 직후에는 도입만 읽고, 혼자 두 번 고른 뒤에 단서가 나온다. 어떻게 읽느냐에 따라 얻는 것이 달라진다.
      //   날짜 줄부터 → 방향을 따라가면 온전한 단서(item-cycle), 줄을 세면 흐릿한 단서(item-cycle-half)
      //   큰 글씨부터 → 아래쪽 작은 글씨를 읽어야 흐릿한 단서, 물러서면 아무것도 못 얻는다
      id: 'graffiti',
      text: '벽의 낙서를 가까이서 읽는다',
      tier: 1,
      findings: [
        {
          text: '벽에 전임자들의 낙서가 빼곡하다. 날짜와 품목, 이름 모를 글씨가 몇 겹으로 덧써져 있다. 어디부터 읽어야 할지 막막하다.',
        },
      ],
      dig: {
        steps: [
          {
            id: 'graffiti-1',
            text: '낙서는 몇 겹으로 덧써져 있다. 한 겹씩 읽어야 한다. 어디부터 읽을까?',
            choices: [
              { id: 'graffiti-1-date', text: '날짜가 적힌 줄을 위에서부터 차례로 읽는다', then: 'graffiti-2a' },
              { id: 'graffiti-1-big', text: '가장 크게 적힌 글씨부터 읽는다', then: 'graffiti-2b' },
            ],
          },
          {
            id: 'graffiti-2a',
            text: '날짜 줄마다 품목이 한 글자씩 적혀 있다. 이제 무엇을 확인할까?',
            choices: [
              {
                id: 'graffiti-2a-order',
                text: '품목이 어떤 순서로 이어지는지, 그 방향을 따라간다',
                result:
                  '동전, 사진, 사원증, 동전, 사진, 사원증… 같은 순서로 되풀이된다.\n그 아래 누군가 크게 적었다. “자판기는 어제 받은 것의 다음 것을 받는다. 가벼운 것에서 소중한 것으로.”',
                effects: [learn('item-cycle')],
              },
              {
                id: 'graffiti-2a-count',
                text: '날짜 줄이 모두 몇 줄인지 헤아려 본다',
                result: '줄을 세다 보니 품목이 같은 순서로 되풀이되는 것이 눈에 들어왔다. 하지만 어느 쪽으로 도는지는 끝내 읽어 내지 못했다.',
                effects: [learn('item-cycle-half')],
              },
            ],
          },
          {
            id: 'graffiti-2b',
            text: '큰 글씨는 읽을수록 흐릿해지고 눈이 아프다. “여기 오지 마”라는 말뿐이다. 벽 아래쪽에는 작은 글씨 줄이 보인다.',
            choices: [
              {
                id: 'graffiti-2b-low',
                text: '허리를 굽혀 아래쪽의 작은 글씨를 읽는다',
                result: '아래쪽의 작은 글씨에서 품목이 같은 순서로 되풀이되는 것을 읽었다. 허리가 아파 오래 읽지는 못했다.',
                effects: [learn('item-cycle-half')],
              },
              {
                id: 'graffiti-2b-leave',
                text: '더 읽지 않고 물러선다',
                result: '큰 글씨의 기운에 눌려 더는 읽지 못했다. 알아낸 것은 없다.',
                later: sanityLater(1),
              },
            ],
          },
        ],
      },
    },
    {
      id: 'receipt',
      text: '바닥에 떨어진 영수증 종이를 주워 읽는다',
      tier: 1,
      risk: '영수증을 집어 든 순간 인쇄된 글자가 잉크처럼 번져 손가락을 타고 올라왔다. 털어 내도 손끝이 한참 얼얼했고, 종이는 어느새 새하얗게 비어 있었다.',
      findings: [{ text: '바닥에 떨어진 영수증을 주워 읽기로 했다. 종이가 아직 따뜻하다.' }],
      dig: digTwoStep('receipt', {
        first: {
          text: '영수증에는 줄이 여러 개 찍혀 있다. 어디부터 읽을까?',
          good: '맨 윗줄부터 거래 내역을 차례로 읽는다',
          bad: '아랫줄의 합계부터 본다',
          badEnd: '합계는 0이었다. 거래 내역은 읽지 못했다.',
        },
        second: {
          text: '거래 내역이 이어진다. 무엇을 확인할까?',
          good: '날짜가 어제인지 보고 그 줄의 품목을 읽는다',
          bad: '가장 큰 글씨만 읽는다',
          badEnd: '큰 글씨는 상점 이름뿐이었다.',
          badFirst: true,
        },
        clue: ITEM_ORDER.map((p) => ({
          when: priceIs(p),
          result: `바닥의 영수증은 아직 따뜻하다. 맨 윗줄에 어제 날짜의 거래가 한 줄 인쇄되어 있다.\n“어제: ${itemLabel(yesterdayOf(p))}.”`,
          effects: [learn(`yday-${p}`)],
        })),
      }),
    },
    {
      // 영수증과 같은 단서에 이르는 다른 길 (대가는 없다). 둘이 나눠 맡으면 같은 것을 두 번 얻는 셈이 된다.
      id: 'trash',
      text: '휴지통 바닥의 구겨진 종이를 편다',
      tier: 1,
      findings: [{ text: '휴지통 바닥의 구겨진 종이를 펴기로 했다. 잉크가 번져 있다.' }],
      dig: digTwoStep('trash', {
        first: {
          text: '종이가 심하게 구겨져 있다. 어떻게 펼까?',
          good: '주름을 천천히 펴 가며 읽는다',
          bad: '주름을 한 번에 확 펴서 읽는다',
          badEnd: '종이가 찢어져 글씨가 반쪽만 남았다.',
          badFirst: true,
        },
        second: {
          text: '글씨가 군데군데 남아 있다. 무엇을 찾을까?',
          good: '남은 줄 가운데 날짜가 있는 줄을 찾는다',
          bad: '글씨가 큰 줄만 읽는다',
          badEnd: '큰 글씨는 광고 문구였다.',
        },
        clue: ITEM_ORDER.map((p) => ({
          when: priceIs(p),
          result: `구겨진 종이는 누군가 버린 거래 내역이다. 마지막 줄에 품목이 한 줄 찍혀 있다.\n“어제: ${itemLabel(yesterdayOf(p))}.”`,
          effects: [learn(`yday-${p}`)],
        })),
      }),
    },
    {
      // 알아낼 것이 없는 곳: 한 라운드에 한 곳만 살필 수 있으므로 여기를 고르면 그만큼 놓친다.
      id: 'display',
      text: '자판기 표시등의 숫자를 읽는다',
      tier: 1,
      findings: [
        {
          text: '표시등에는 “0 0 0”이 떠 있다. 몇 번을 다시 읽어도 숫자는 바뀌지 않는다. 의미를 읽어 낼 수 없었다.',
        },
      ],
    },
    {
      // 아이템은 낮의 조사에서만 얻는다. 이미 누가 플래시를 가졌으면 이 곳은 보이지 않는다.
      id: 'cabinet',
      text: '휴게실 구석의 서랍을 뒤져 본다',
      tier: 1,
      when: { not: { item: 'flash' } },
      findings: [
        {
          text: '서랍 속에서 손바닥만 한 소형 플래시를 찾았다. 건전지는 아직 살아 있다. 방금까지 누군가 쥐고 있었던 것처럼 따뜻하다. 챙겼다.',
          effects: [{ give: 'flash', to: 'actor' }],
        },
      ],
    },
    {
      id: 'slot',
      text: '투입구 안쪽을 손끝으로 더듬어 살핀다',
      tier: 2,
      needsHealthy: true,
      risk: '더듬던 손가락을 투입구가 살짝 물었다. 빼내려 하자 입이 더 오므라들었다. 겨우 빼냈을 때 손가락 마디에는 이빨 같은 자국이 선명했다.',
      findings: byPrice((p) => {
        const x = nextOf(ITEM_ORDER, p, 1)
        return { text: `${SLOT_TEXT[x]}\n나머지 둘 중 무엇인지는 이것만으로는 모르겠다.`, effects: [learn(`no-item-${x}`)] }
      }),
    },
    {
      id: 'tray-pair',
      text: '한 명은 투입구 덮개를 밀어 열어 두고, 한 명은 안쪽의 홈을 들여다본다',
      tier: 2,
      min: 2,
      needsHealthy: true,
      risk: '덮개를 잡고 있던 손 위로 투입구가 닫히려 들었다. 둘이 함께 밀어 겨우 막았지만, 덮개에 눌린 손등에는 금세 멍이 올라왔다.',
      findings: byPrice((p) => ({
        text: `한 사람이 투입구의 덮개를 밀어 열어 두고, 다른 사람이 안쪽 홈을 들여다보았다. 오늘 열려 있는 홈은 ${SHAPE[p]}이다.`,
        effects: [learn(`today-${p}`)],
      })),
    },
    {
      id: 'tray-solo',
      text: '혼자 한 손으로 덮개를 밀어 열어 두고 안쪽의 홈을 들여다본다 (손이 끼일 것 같다)',
      tier: 2,
      when: { party: { max: 1 } },
      findings: byPrice((p) => ({
        text: `한 손으로 덮개를 밀어 열어 둔 채 안쪽 홈을 들여다보았다. 덮개가 손등을 눌렀다. 오늘 열려 있는 홈은 ${SHAPE[p]}이다.`,
        effects: [learn(`today-${p}`)],
        later: sanityLater(2),
      })),
    },
    {
      id: 'lit',
      text: '소형 플래시로 투입구 안쪽 홈을 비춰 본다',
      tier: 1,
      when: { item: 'flash', by: 'actor' },
      findings: [{ text: '소형 플래시를 투입구 안쪽으로 비추기로 했다. 좁은 틈이라 어디에 빛을 둘지가 중요하다.' }],
      dig: digTwoStep('lit', {
        first: {
          text: '투입구는 좁고 깊다. 빛을 어떻게 댈까?',
          good: '플래시를 비스듬히 대어 홈의 가장자리를 비춘다',
          bad: '플래시를 투입구 한가운데로 곧게 비춘다',
          badEnd: '빛이 안쪽에서 번져 아무것도 구분되지 않았다.',
          badFirst: true,
        },
        second: {
          text: '홈의 가장자리가 어슴푸레 보인다. 무엇을 확인할까?',
          good: '홈의 모양과 두께를 눈으로 가늠한다',
          bad: '홈의 깊이를 손가락으로 재 본다',
          badEnd: '손가락이 끼일 뻔했다. 홈의 모양은 보지 못했다.',
        },
        clue: ITEM_ORDER.map((p) => ({
          when: priceIs(p),
          result: `소형 플래시로 투입구 안쪽을 비추자 홈의 모양이 또렷하다. ${SHAPE[p]}이다. 손이 끼일 걱정은 없다.`,
          effects: [learn(`today-${p}`)],
        })),
      }),
    },
    {
      id: 'ledger',
      text: '자판기 옆에 걸린 장부의 오늘 줄을 읽는다',
      tier: 3,
      risk: '장부를 넘기던 손가락이 종이에 베였다. 피 한 방울이 떨어지자 오늘 줄의 글씨가 잠깐 꿈틀했다가 제자리로 돌아왔다.',
      findings: [{ text: '자판기 옆에 걸린 장부를 펼쳤다. 줄이 빽빽해서 오늘 날짜의 줄이 어디인지부터 찾아야 한다.' }],
      dig: digTwoStep('ledger', {
        first: {
          text: '장부는 두껍고 날짜가 촘촘하다. 어떻게 찾을까?',
          good: '가장 최근 날짜의 줄을 찾아 손가락으로 짚는다',
          bad: '장부의 첫 장부터 차례로 넘긴다',
          badEnd: '넘길수록 장부가 두꺼워지는 것 같았다. 오늘의 줄을 찾지 못했다.',
        },
        second: {
          text: '오늘 날짜의 줄이 보인다. 무엇을 읽을까?',
          good: '비어 있는 칸 옆의 작은 글씨를 읽는다',
          bad: '합계 칸의 숫자를 읽는다',
          badEnd: '합계 칸에는 아무것도 적혀 있지 않았다.',
          badFirst: true,
        },
        clue: ITEM_ORDER.map((p) => ({
          when: priceIs(p),
          result: `장부의 오늘 날짜 줄은 비어 있다. 그 옆에 아주 작게 적혀 있다. “${itemLabel(p)}.”`,
          effects: [learn(`ledger-${p}`)],
        })),
      }),
    },
  ],
  night: {
    options: [
      ...byPriceNight(
        'dates',
        '혼자 벽의 맨 위쪽, 가장 최근 날짜 옆의 글씨를 읽는다',
        (p) => `night-last-${p}`,
        (p) => ({
          result: `벽 맨 위쪽의 가장 최근 날짜 옆에 품목이 적혀 있다. “${itemLabel(yesterdayOf(p))}.” 어제 거래한 사람이 남긴 글씨다.`,
          effects: [learn(`night-last-${p}`)],
          later: sanityLater(1),
        }),
      ),
      ...byPriceNight(
        'slot-ear',
        '혼자 투입구에 귀를 대고 소리를 듣는다',
        (p) => `no-item-${yesterdayOf(p)}`,
        (p) => ({
          result: `투입구에 귀를 대고 한참 들었다. ${itemLabel(yesterdayOf(p))}이 지나가는 소리는 나지 않는다. 어제 받은 것은 오늘 받지 않는 모양이다.`,
          effects: [learn(`no-item-${yesterdayOf(p)}`)],
        }),
      ),
      // 밤에는 아이템을 얻을 수 없고, 가진 아이템을 쓰는 선택지만 있다. 플래시는 낮의 조사(구석의 서랍)에서 얻는다.
      ...byPriceNight(
        'lit-night',
        '혼자 소형 플래시로 투입구 안쪽 홈을 비춰 본다',
        (p) => `today-${p}`,
        (p) => ({
          result: `소형 플래시로 투입구 안쪽을 비추자 홈의 모양이 또렷하다. ${SHAPE[p]}이다. 손이 끼일 걱정은 없다.`,
          effects: [learn(`today-${p}`)],
        }),
      ).map(withItem('flash')),
    ],
  },
  hazard: [{ hurt: 'actor' }],
  question: '자판기는 오늘 무엇을 받는가?',
  chain: itemChain(),
  passStory: '아직 확신이 없다. 답을 걸지 않고 다시 둘러보기로 했다. 그러는 사이 푸른 얼룩이 벽을 한 뼘 더 타고 올랐다.',
  solved: ITEMS.map(([id, label]) => ({
    text: `투입구 앞에 ${label}을 조심스럽게 가져다 댔다. 넣지는 않았다.\n투입구의 표시등이 [[loud|초록]]으로 켜졌다. 자판기가 낮게 ‘응’ 하고 대답했다.\n맞다. 오늘 이 기계가 받는 것은 ${label}이다.`,
    when: priceIs(id),
  })),
  board: {
    text: '자판기는 오늘 무엇을 받는가?',
    facts: [
      'item-cycle',
      'item-cycle-half',
      ...ITEM_ORDER.flatMap((p) => [`yday-${p}`, `night-last-${p}`, `no-item-${p}`, `today-${p}`, `ledger-${p}`]),
    ],
    answer: ITEMS.map(([id, label]) => ({ text: `${label}이다.`, when: priceIs(id) })),
  },
}

const button: TaskDef = {
  id: 'button',
  title: '버튼',
  period: 'day',
  place: 'button',
  intro:
    '자판기 앞면에는 버튼이 세 개 있다. 이름도, 번호도 없다. 정해진 하나만 눌러야 한다는 것은 알 수 있다.\n버튼 아래 덮개 틈으로 전선 세 가닥이 들어가는 것이 보인다. 빨강, 파랑, 초록. 어느 버튼을 눌러야 하는지 알아내야 한다.',
  probes: [
    {
      id: 'notice',
      text: '버튼 위에 붙은 낡은 스티커를 읽는다',
      tier: 1,
      findings: [{ text: '버튼 위에 붙은 낡은 스티커를 읽기로 했다. 반쯤 벗겨져 있다.' }],
      dig: digTwoStep('notice', {
        first: {
          text: '스티커가 반쯤 벗겨져 있다. 어떻게 읽을까?',
          good: '남아 있는 글씨를 한 글자씩 읽는다',
          bad: '벗겨진 자리를 손톱으로 더 벗겨 본다',
          badEnd: '스티커가 더 찢어졌다. 남은 글씨도 읽을 수 없게 되었다.',
        },
        second: {
          text: '글씨가 이어진다. 무엇을 찾을까?',
          good: '“눌러야”라는 말 뒤에 이어지는 조건을 찾는다',
          bad: '스티커의 그림만 본다',
          badEnd: '그림은 번개 무늬뿐이었다.',
          badFirst: true,
        },
        clue: [
          {
            result: '스티커가 반쯤 벗겨져 있다. “눌러야 할 칸에는 초록 선이 이어져 있습니다.” 그 아래는 찢겨 없다.',
            effects: [learn('wire-rule')],
          },
        ],
      }),
    },
    {
      id: 'ear',
      text: '버튼 아래쪽에 귀를 대고 전류 소리를 따라간다',
      tier: 1,
      risk: '귀를 대는 순간 전류가 귓바퀴를 튀어 지나갔다. 한쪽 귀가 한참 윙윙거렸고, 머리를 흔들어도 소리가 가시지 않았다.',
      findings: [{ text: '버튼 아래쪽에 귀를 대고 전류 소리를 따라가기로 했다. 웅웅거리는 소리가 선마다 다르다.' }],
      dig: digTwoStep('ear', {
        first: {
          text: '전류 소리가 귓가를 울린다. 어떻게 들을까?',
          good: '귀를 살짝 떼고 소리가 가장 센 선을 눈으로 좇는다',
          bad: '귀를 바짝 붙이고 소리만 듣는다',
          badEnd: '소리가 머릿속에서 울려 어느 선인지 가려내지 못했다.',
          badFirst: true,
        },
        second: {
          text: '선이 몇 가닥 보인다. 어느 선을 따라갈까?',
          good: '빨간 선을 끝까지 눈으로 따라간다',
          bad: '가까운 선 하나를 골라 따라간다',
          badEnd: '고른 선은 빨간 선이 아니었다.',
        },
        clue: wiringClues((w) => ({
          result: `전류 소리를 따라 선을 눈으로 좇았다. 빨간 선이 ${buttonLabel(w.red)} 칸으로 들어간다.`,
          effects: [learn(`red-at-${w.red}`)],
          later: sanityLater(1),
        })),
      }),
    },
    {
      id: 'dust',
      text: '덮개 틈으로 보이는 파란 선의 끝을 따라가 본다',
      tier: 1,
      risk: '덮개 틈에 눈을 가까이 대자 틈에서 불꽃이 튀었다. 눈앞이 하얘졌다가 천천히 돌아왔지만, 눈두덩이 화끈거리고 한동안 초점이 맞지 않았다.',
      findings: [{ text: '덮개 틈으로 보이는 파란 선의 끝을 따라가 보기로 했다. 틈이 좁다.' }],
      dig: digTwoStep('dust', {
        first: {
          text: '덮개 틈이 좁고 어둡다. 어떻게 들여다볼까?',
          good: '틈에서 한 뼘 떨어져 비스듬히 들여다본다',
          bad: '틈에 눈을 바짝 대고 들여다본다',
          badEnd: '틈에서 불꽃이 튀었다. 눈앞이 하얘져 아무것도 보지 못했다.',
        },
        second: {
          text: '파란 선이 어둠 속으로 이어진다. 무엇을 확인할까?',
          good: '파란 선이 닿는 칸을 하나씩 짚어 본다',
          bad: '선의 색만 확인한다',
          badEnd: '색은 파랬다. 그것뿐이다.',
          badFirst: true,
        },
        clue: wiringClues((w) => ({
          result: `덮개 틈으로 파란 선의 끝을 따라가 보았다. ${buttonLabel(w.green)} 칸으로는 가지 않는다.`,
          effects: [learn(`blue-not-${w.green}`)],
        })),
      }),
    },
    {
      // 아이템은 낮의 조사에서만 얻는다. 이미 누가 장갑을 가졌으면 이 곳은 보이지 않는다.
      id: 'toolbox',
      text: '정비 서랍을 뒤져 본다',
      tier: 1,
      when: { not: { item: 'glove' } },
      findings: [
        {
          text: '정비 서랍 맨 아래에서 두꺼운 절연 장갑을 찾았다. 한 켤레뿐이다. 손가락 끝에 검게 그을린 자국이 있다. 챙겼다.',
          effects: [{ give: 'glove', to: 'actor' }],
        },
      ],
    },
    {
      id: 'peek-glove',
      text: '절연 장갑을 끼고 덮개를 열어 초록 선의 끝을 확인한다',
      tier: 1,
      when: { item: 'glove', by: 'actor' },
      findings: [{ text: '절연 장갑을 끼고 덮개를 열기로 했다. 고무 장갑 안에서 손끝이 둔하다.' }],
      dig: digTwoStep('peek-glove', {
        first: {
          text: '덮개 안쪽에 전선이 어지럽게 모여 있다. 어떻게 열까?',
          good: '덮개를 천천히 젖혀 선이 보이게 한다',
          bad: '덮개를 한 번에 열어젖힌다',
          badEnd: '덮개가 튕겨 열리며 선들이 흩어졌다. 어느 선이 어느 선인지 알 수 없다.',
        },
        second: {
          text: '선이 드러났다. 무엇을 확인할까?',
          good: '초록 선의 끝이 어느 칸에 닿는지 짚어 본다',
          bad: '가장 가까운 선 하나만 확인한다',
          badEnd: '그 선은 초록 선이 아니었다.',
          badFirst: true,
        },
        clue: wiringClues((w) => ({
          result: `절연 장갑을 끼고 덮개를 열었다. 초록 선의 끝이 ${buttonLabel(w.green)} 칸에 이어져 있다. 손끝이 저리지 않았다.`,
          effects: [learn(`green-at-${w.green}`)],
        })),
      }),
    },
    {
      id: 'peek',
      text: '덮개를 열고 초록 선의 끝을 직접 확인한다 (전류에 손끝이 저리다)',
      tier: 2,
      needsHealthy: true,
      risk: '덮개를 젖히는 손등에 방전이 튀었다. 팔이 쭉 뻗은 채 굳었다가 한참 만에 풀렸다. 풀린 뒤에도 손가락이 제 뜻대로 움직이지 않았다.',
      findings: byWiring((w) => ({
        text: `덮개를 열어 초록 선의 끝을 확인했다. ${buttonLabel(w.green)} 칸에 이어져 있다. 손끝이 저렸다.`,
        effects: [learn(`green-at-${w.green}`)],
        later: sanityLater(2),
      })),
    },
    {
      id: 'pair',
      text: '두 사람이 서로 다른 칸에 귀를 대고 동시에 전류를 비교한다',
      tier: 2,
      min: 2,
      findings: byWiring((w) => ({
        text: `두 사람이 서로 다른 칸에 귀를 대고 동시에 들었다. 가장 센 전류는 ${buttonLabel(w.green)} 칸에서 올라온다. 초록 선이다.`,
        effects: [learn(`green-at-${w.green}`)],
      })),
    },
    {
      id: 'panel',
      text: '자판기 옆면의 정비 패널을 연다',
      tier: 3,
      needsHealthy: true,
      risk: '정비 패널의 모서리가 날카로웠다. 손바닥이 베여 피가 맺혔는데, 방울이 안쪽 배선도 위로 떨어지자 선들이 한 번 꿈틀했다.',
      findings: byWiring((w) => ({
        text: `정비 패널 안쪽에 배선도가 붙어 있다. 빨강은 ${buttonLabel(w.red)}, 초록은 ${buttonLabel(w.green)}, 파랑은 ${buttonLabel(w.blue)} 칸에 이어진다.`,
        effects: [learn(`wiring-${w.green}-${w.red}`)],
      })),
    },
  ],
  night: {
    options: [
      ...byWiringNight(
        'blue',
        '혼자 파란 선을 끝까지 따라가 본다',
        (w) => `blue-at-${w.blue}`,
        (w) => ({
          result: `파란 선을 덮개 틈으로 끝까지 따라갔다. ${buttonLabel(w.blue)} 칸으로 들어간다.`,
          effects: [learn(`blue-at-${w.blue}`)],
          later: sanityLater(1),
        }),
      ),
      ...byWiringNight(
        'heat',
        '혼자 버튼을 손등으로 스쳐 온기를 비교한다',
        (w) => `heat-${w.green}`,
        (w) => ({
          result: `세 버튼을 손등으로 차례로 스쳤다. ${buttonLabel(w.green)} 칸이 가장 따뜻하다. 전류가 가장 센 칸이라는 뜻이다.`,
          effects: [learn(`heat-${w.green}`)],
          later: sanityLater(1),
        }),
      ),
      // 밤에는 아이템을 얻을 수 없고, 가진 아이템을 쓰는 선택지만 있다. 장갑은 낮의 조사(정비 서랍)에서 얻는다.
      ...byWiringNight(
        'glove-night',
        '혼자 절연 장갑을 끼고 덮개를 열어 초록 선의 끝을 확인한다',
        (w) => `green-at-${w.green}`,
        (w) => ({
          result: `절연 장갑을 끼고 덮개를 열었다. 초록 선의 끝이 ${buttonLabel(w.green)} 칸에 이어져 있다. 손끝이 저리지 않았다.`,
          effects: [learn(`green-at-${w.green}`)],
        }),
      ).map(withItem('glove')),
    ],
  },
  hazard: [{ hurt: 'actor' }],
  question: '눌러야 할 버튼은 어느 것인가?',
  answers: BUTTONS.map(
    ([id, label]): TaskAnswer => ({
      id: `btn-${id}`,
      text: `${label} 버튼(${id})이다`,
      right: buttonIs(id),
      wrong: `${label} 버튼(${id}) 위에 손바닥을 얹었다. 누르지는 않았다.\n버튼은 차가웠다. 그리고 [[whisper|아주 먼 곳에서]] 문이 한 번 닫히는 소리가 났다.\n이 버튼은 아니다.`,
      wrongFact: `no-btn-${id}`,
    }),
  ),
  passStory: '아직 확신이 없다. 답을 걸지 않고 다시 둘러보기로 했다. 그러는 사이 푸른 얼룩이 벽을 한 뼘 더 타고 올랐다.',
  solved: BUTTONS.map(([id, label]) => ({
    text: `${label} 버튼(${id}) 위에 손바닥을 얹었다. 누르지는 않았다.\n버튼 아래에서 아주 작은 전류 소리가 올라왔다. 누르라는 듯이.\n맞다. 눌러야 할 것은 ${label} 버튼이다.`,
    when: buttonIs(id),
  })),
  board: {
    text: '어느 버튼을 눌러야 하는가?',
    facts: [
      'wire-rule',
      ...BUTTON_ORDER.flatMap((b) => [`red-at-${b}`, `blue-not-${b}`, `blue-at-${b}`, `green-at-${b}`, `heat-${b}`, `no-btn-${b}`]),
      ...BUTTON_ORDER.flatMap((g) => BUTTON_ORDER.filter((r) => r !== g).map((r) => `wiring-${g}-${r}`)),
    ],
    answer: BUTTONS.map(([id, label]) => ({ text: `${label} 버튼(${id})이다.`, when: buttonIs(id) })),
  },
}

const change: TaskDef = {
  id: 'change',
  title: '거스름돈',
  period: 'day',
  place: 'change',
  intro:
    '반환구가 작게 딸각거린다. 거래가 끝나면 거스름돈이 떨어진다고 한다. 그것을 어떻게 하느냐에 따라 거래가 끝나기도, 다시 시작되기도 한다는 이야기가 벽에 적혀 있다.\n거래가 끝난 뒤 거스름돈을 어떻게 해야 하는지 알아내야 한다.',
  probes: [
    {
      id: 'wall',
      text: '벽의 낙서 아래쪽을 읽는다',
      tier: 1,
      risk: '‘받지 마’를 읽는 동안 글자들이 눈앞에서 한 줄씩 늘어나는 것 같았다. 눈을 뗄 수 없어 한참을 그대로 서 있었고, 정신을 차렸을 때 벽의 글씨는 처음 그대로였다.',
      findings: [{ text: '벽의 낙서 아래쪽을 읽기로 했다. 같은 글씨가 반복되어 눈이 아프다.' }],
      dig: digTwoStep('wall', {
        first: {
          text: '같은 글씨가 줄줄이 이어진다. 어떻게 읽을까?',
          good: '반복되는 글씨는 건너뛰고 다른 글씨를 찾는다',
          bad: '반복되는 글씨를 끝까지 읽는다',
          badEnd: '“받지 마”를 읽을수록 글씨가 늘어나는 것 같았다. 눈을 뗄 수 없어 시간만 흘렀다.',
          badFirst: true,
        },
        second: {
          text: '글씨 크기가 군데군데 다르다. 어디를 읽을까?',
          good: '작게 적힌 글씨를 읽는다',
          bad: '가장 큰 글씨를 다시 읽는다',
          badEnd: '큰 글씨는 아까와 같았다.',
        },
        clue: [
          {
            result:
              '벽의 낙서를 한 줄씩 읽는다. 날짜와 상품 번호 사이에 같은 글씨가 반복된다.\n[[shake|받지 마.]] [[shake|받지 마.]] [[shake|받지 마.]]\n그 아래 누군가 더 작게 적었다. “손이 안 빠진다. 거스름돈을 쥐면 그게 빚이 된다.”',
            effects: [learn('change-debt')],
          },
        ],
      }),
    },
    {
      id: 'tray-paper',
      text: '반환구 뚜껑 안쪽에 붙은 종이를 읽는다',
      tier: 1,
      risk: '종이를 읽는 동안 반환구 안쪽에서 동전 구르는 소리가 났다. 굴러 나올 것 같은데 끝내 나오지 않았다. 기다리는 동안 손바닥에 식은땀이 찼다.',
      findings: [{ text: '반환구 뚜껑 안쪽에 종이가 붙어 있다. 뚜껑이 무겁다.' }],
      dig: digTwoStep('tray-paper', {
        first: {
          text: '뚜껑을 어떻게 열까?',
          good: '뚜껑을 살짝 들어 종이의 인쇄된 줄을 읽는다',
          bad: '뚜껑을 활짝 열어 안쪽을 들여다본다',
          badEnd: '뚜껑이 열리자 동전이 쏟아질 것 같아 황급히 닫았다. 종이를 읽지 못했다.',
        },
        second: {
          text: '종이에 줄이 몇 개 있다. 어디를 읽을까?',
          good: '맨 아래 줄까지 읽는다',
          bad: '항목 칸의 빈칸을 오래 본다',
          badEnd: '빈칸에는 아무것도 없다. 시간만 흘렀다.',
          badFirst: true,
        },
        clue: [
          {
            result:
              '반환구 뚜껑 안쪽에 영수증 한 장이 붙어 있다. 항목 칸에는 아무것도 적혀 있지 않고, 맨 아래 줄만 인쇄되어 있다.\n“거스름돈 반환 시 거래는 [[whisper|처음부터]] 다시 시작됩니다.”',
            effects: [learn('change-restart')],
          },
        ],
      }),
    },
    {
      id: 'ledger',
      text: '자판기 아래에 끼워진 장부의 첫머리를 읽는다',
      tier: 2,
      risk: '합계 칸에 방금 읽은 사람의 이름이 연필로 쓰였다가 지워지는 것을 보았다. 지운 자국만 남았고, 그 자국이 오래 눈에 밟혔다.',
      findings: [
        {
          text: '장부 첫머리에 거래의 계산이 적혀 있다. 물건을 넣으면 −1, 거스름돈이 떨어지면 +1. 합이 0이 되어야 거래가 닫힌다.\n그 아래 한 줄. “동이 트면 합이 0이 아닌 것은 가져갑니다.”',
          effects: [learn('change-ledger')],
        },
      ],
    },
    {
      id: 'pair',
      text: '한 명은 반환구의 동전을 쥐고, 한 명은 장부를 지켜본다',
      tier: 2,
      min: 2,
      findings: [
        {
          text: '한 사람이 반환구의 동전을 쥐자 장부의 값이 순식간에 그 사람의 이름 아래로 옮겨 적혔다. 손이 펴지지 않았다. 겨우 뿌리치고서야 풀렸다.',
          effects: [learn('change-moved')],
          later: sanityLater(1),
        },
      ],
    },
    {
      // 아이템은 낮의 조사에서만 얻는다. 이미 누가 집게를 가졌으면 이 곳은 보이지 않는다.
      id: 'toolbox',
      text: '자판기 아래 공구함을 뒤져 본다',
      tier: 1,
      when: { not: { item: 'tongs' } },
      findings: [
        {
          text: '자판기 아래 공구함에서 긴 집게를 찾았다. 끝이 반질반질 닳아 있다. 전임자들이 동전을 집던 것이다. 챙겼다.',
          effects: [{ give: 'tongs', to: 'actor' }],
        },
      ],
    },
    {
      id: 'tongs',
      text: '집게로 반환구의 동전을 집어 올리고 장부를 지켜본다',
      tier: 1,
      when: { item: 'tongs', by: 'actor' },
      findings: [{ text: '집게로 반환구의 동전을 집어 올리기로 했다. 장부는 손이 닿는 곳에 있다.' }],
      dig: digTwoStep('tongs', {
        first: {
          text: '동전이 집게 끝에서 흔들린다. 장부를 어떻게 볼까?',
          good: '동전을 집은 채 장부를 곁눈으로 지켜본다',
          bad: '동전을 집자마자 장부를 덮어 버린다',
          badEnd: '장부를 덮자 아무 일도 일어나지 않았다. 확인하지 못했다.',
        },
        second: {
          text: '장부가 미세하게 떨린다. 어디를 볼까?',
          good: '집게를 든 채 장부의 이름 칸을 지켜본다',
          bad: '동전을 곧장 반환구에 돌려놓는다',
          badEnd: '동전을 돌려놓는 사이 장부의 변화를 놓쳤다.',
          badFirst: true,
        },
        clue: [
          {
            result: '집게로 동전을 집어 올리자 장부의 값이 집게를 쥔 사람의 이름 아래로 옮겨 적혔다. 손은 다치지 않았다.',
            effects: [learn('change-moved')],
          },
        ],
      }),
    },
    {
      id: 'sign',
      text: '반환구 위에 붙은 작은 표지를 읽는다',
      tier: 3,
      risk: '‘떠나세요’를 읽자 어디선가 그럼 가라는 듯한 낮은 속삭임이 들렸다. 정말 떠나도 되는 건지, 아무도 대답해 주지 않았다.',
      findings: [
        {
          text: '반환구 위에 작은 표지가 붙어 있다. “그대로 두고 떠나세요.”',
          effects: [learn('change-sign')],
        },
      ],
    },
  ],
  night: {
    options: [
      {
        id: 'ledger-glance',
        text: '혼자 장부의 오늘 칸을 훔쳐본다',
        when: { not: { knows: 'change-night-ledger' } },
        result: '장부를 몰래 들춰 오늘 줄을 보았다. 합계 칸이 비어 있다. 비어 있어야 거래가 닫힌다고, 그 아래 작은 글씨가 말한다.',
        effects: [learn('change-night-ledger')],
        later: sanityLater(1),
      },
      {
        id: 'smell',
        text: '혼자 반환구 안쪽의 냄새를 맡는다',
        when: { not: { knows: 'change-night-warm' } },
        result: '반환구에 얼굴을 가까이 댔다. 쇠 냄새와 함께 따뜻한 기운이 올라온다. 동전이 아직 따뜻하다. 쥐면 놓기 어려울 것 같다.',
        effects: [learn('change-night-warm')],
      },
      // 밤에는 아이템을 얻을 수 없고, 가진 아이템을 쓰는 선택지만 있다. 집게는 낮의 조사(아래의 공구함)에서 얻는다.
      {
        id: 'tongs-night',
        text: '혼자 집게로 반환구의 동전을 집어 올리고 장부를 지켜본다',
        when: { all: [{ item: 'tongs', by: 'actor' }, { not: { knows: 'change-moved' } }] },
        result: '집게로 동전을 집어 올리자 장부의 값이 집게를 쥔 사람의 이름 아래로 옮겨 적혔다. 손은 다치지 않았다.',
        effects: [learn('change-moved')],
      },
    ],
  },
  hazard: [{ stat: 'sanity', add: -3, to: 'actor' }],
  question: '거래가 끝난 뒤, 거스름돈은 어떻게 해야 하는가?',
  answers: [
    {
      id: 'take',
      text: '거스름돈을 받아서 주머니에 넣는다',
      right: false,
      wrong: '반환구의 동전을 쥐는 시늉을 했다. 손가락이 닿자마자 [[shake|손이 빠지지 않았다.]]\n힘껏 뿌리치고서야 풀렸다. 손바닥에 동전 모양의 자국이 오래 남았다.\n받는 것은 아니다.',
      wrongFact: 'change-debt',
    },
    {
      id: 'again',
      text: '거스름돈을 도로 투입구에 넣어 다시 거래한다',
      right: false,
      wrong: '반환구의 동전을 투입구에 가져다 댔다. 투입구가 반가운 듯 입을 벌렸다.\n표시등이 처음으로 돌아갔다. [[flicker|0, 0, 0.]] 서둘러 손을 뺐다.\n도로 넣는 것은 아니다.',
      wrongFact: 'change-restart',
    },
    {
      id: 'cover',
      text: '반환구 뚜껑을 눌러 닫아, 거스름돈이 나오지 못하게 막는다',
      right: false,
      wrong:
        '반환구 뚜껑을 손바닥으로 눌러 닫았다. 안쪽에서 동전들이 끓는 물처럼 부딪쳤다.\n막는다고 거래가 끝난 것이 아니다. 장부의 합계 칸은 여전히 닫히지 않은 채 깜빡였다.\n뚜껑을 누른 손바닥 아래로 [[shake|밀어 올리는 힘]]이 느껴져 서둘러 손을 뗐다. 막는 것도 답이 아니다.',
      wrongFact: 'change-no-cover',
    },
    { id: 'leave', text: '거스름돈에는 손대지 않고, 반환구를 그대로 둔 채 자리를 뜬다', right: true },
  ] satisfies TaskAnswer[],
  passStory: '아직 확신이 없다. 답을 걸지 않고 다시 둘러보기로 했다. 그러는 사이 푸른 얼룩이 벽을 한 뼘 더 타고 올랐다.',
  solved:
    '반환구 앞에서 한참 서 있었다. 손을 뻗지 않았다. 뻗고 싶지도 않았다.\n반환구의 뚜껑이 [[whisper|아쉬운 듯]] 천천히 닫혔다.\n맞다. 거스름돈은 받지도, 도로 넣지도 않고 그대로 두고 떠나는 것이다.',
  board: {
    text: '거스름돈은 어떻게 해야 하는가?',
    facts: ['change-debt', 'change-restart', 'change-ledger', 'change-moved', 'change-night-ledger', 'change-night-warm', 'change-sign', 'change-no-cover'],
    answer: '받지도, 도로 넣지도 않고 그대로 두고 떠난다.',
  },
}

// ───────────────────────── 막간: 사건과 휴식 ─────────────────────────
// 과제 ①이 풀리면 혼자 울리는 소리, 과제 ②가 풀리면 자판기의 목소리가 오고, 둘 다 잠깐의 휴식(개인 행동)으로 이어진다.

/** 밤의 스텟 선택지. 오답·패스 뒤의 밤에는 과제의 선택지와 함께, 과제를 푼 뒤의 휴식에는 이것만 나온다. */
const NIGHT_STAT: PersonalOption[] = [
  {
    id: 'coffee',
    text: '종이컵에 믹스커피를 타서 마신다',
    calming: true,
    result: '믹스커피는 뜨겁고 지나치게 달았다. 두 손으로 컵을 감싸고 있으니 손끝에 감각이 돌아왔다.\n잠시 마음이 가라앉았다.',
    effects: [{ stat: 'sanity', add: 2, to: 'actor' }, { heal: 'actor' }],
  },
  {
    id: 'study',
    text: '지금까지 눈으로 본 것을 종이에 적어 정리한다',
    result:
      '지금까지 눈으로 본 것을 순서대로 종이에 적었다. 적고 나니 서로 맞물리지 않던 것들이 조금씩 겹쳐 보인다.\n머리가 맑아졌다. 글자 사이의 빈틈이 보이기 시작한다.',
    effects: [{ stat: 'insight', add: 1, to: 'actor' }],
  },
]

const built = buildTasks({
  tasks: [item, button, change],
  after: 'gather',
  nightCommon: NIGHT_STAT,
  between: [
    { when: { not: { flag: 'hum' } }, to: 'event-hum' },
    { when: { not: { flag: 'voice' } }, to: 'event-voice' },
    { to: 'rest' },
  ],
  passText: '확신이 없다 — 답을 걸지 않고 더 조사한다 (오염이 번진다)',
})

const BAD_FLAGS = ['end-erased', 'end-slot', 'end-debt', 'end-greedy', 'end-dawn']
const noBadFlag: Cond[] = BAD_FLAGS.map((f): Cond => ({ not: { flag: f } }))

const STORY_NODES: Node[] = [
  // ───── 도착
  {
    id: 'arrive',
    period: 'day',
    place: 'room',
    // 정전은 이야기 내내 이어진다: 낮이어도 배경은 밤처럼 어둡다
    dark: true,
    kind: 'story',
    title: '정전',
    text: '점검 중에 건물 전체가 [[flicker|꺼졌다.]] 비상등마저 들어오지 않았다. 더듬어서 지하 2층 휴게실로 내려왔다.\n문이 등 뒤에서 [[loud|철컥]] 하고 잠겼다. 전자식 도어락이다. 정전 중에는 열리지 않는다.\n어둠 속에서 단 하나, 자판기만 켜져 있다. 불빛이 방 안을 푸르게 물들이고 있다. [[whisper|물든 자리는 천천히 번지며 어두워진다.]] 방이 전부 물들면 어떻게 되는지는 알 수 없다. 주머니에는 낡은 동전, 가족사진, 사원증이 들어 있다.',
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
        result:
          '자판기 앞에 선다. 진열창에는 아무것도 들어 있지 않다. 그런데도 버튼 세 개에는 번호 대신 아무 표시도 없다.\n투입구 위에 작은 글씨가 붙어 있다. “[[whisper|받은 것의 무게만큼만 내어 드립니다.]]”',
        effects: [{ learn: 'machine-sums', to: 'actor' }],
      },
      {
        id: 'door',
        text: '휴게실 문을 다시 밀어 본다',
        result:
          '문손잡이는 꿈쩍도 하지 않는다. 문 옆 도어락의 표시등은 꺼져 있다.\n문틈 아래로 바람이 새어 들어온다. 어디선가 커피 냄새가 난다. 정전 중인데도.',
        effects: [{ learn: 'door-locked', to: 'actor' }],
      },
      {
        id: 'floor',
        text: '바닥과 벽을 둘러본다',
        result:
          '카펫은 닳아서 바닥의 시멘트 색이 드러나 있다. 자판기 앞의 한 곳만 유독 깊게 닳았다. 누군가 오래 서 있던 자리다.\n자판기 옆 벽에는 낙서가 빼곡하다. 읽으려면 가까이 가야 한다.',
        effects: [{ learn: 'wall-writing', to: 'actor' }],
      },
      {
        id: 'pocket',
        text: '주머니를 뒤진다',
        result:
          '주머니에는 세 가지뿐이다. 낡은 동전, 모서리가 접힌 가족사진, 목에서 풀어 둔 사원증.\n하나같이 오래 가지고 다닌 것들이다. 이 중 하나를 잃게 된다면 무엇이 가장 아플까, 하는 생각이 불쑥 든다.',
      },
    ],
    next: built.enter,
  },

  // ───── 과제들
  ...built.nodes,

  // ───── 사건: 혼자 울리는 소리 (과제 ①이 풀린 뒤)
  {
    id: 'event-hum',
    period: 'night',
    place: 'room',
    kind: 'vote',
    title: '혼자 울리는 소리',
    text: '자판기가 [[whisper|낮게]] 울린다. 모터가 아니라 목소리 같은 소리다. 반환구 쪽에서 [[flicker|딸랑, 딸랑]] 하고 동전이 떨어지는 소리가 한참 이어진다. 아무도 투입하지 않았는데.',
    choices: [
      {
        id: 'listen',
        text: '숨을 죽이고 소리가 끝날 때까지 듣는다',
        result:
          '귀를 기울였다. 동전 소리는 정확히 같은 간격으로 이어졌다. 열, 열하나, 열둘, 그러다 어느 순간 뚝 그쳤다.\n벽에 걸린 시계가 소리 없이 한 칸을 건너뛴 것 같았다. 동이 트면 이 기계는 장부를 정산한다는 것을 이상하게도 알 것 같았다.',
        effects: [{ flag: 'hum' }, { learn: 'dawn-collect', to: 'all' }],
        later: [{ stat: 'sanity', add: -1, to: 'all' }],
        next: 'rest',
      },
      {
        id: 'unplug',
        text: '전원 코드를 찾아 뽑아 버린다',
        result:
          '벽 뒤를 더듬어 코드를 찾았다. 플러그는 벽이 아니라 바닥의 어디론가 이어져 있었다. 힘껏 잡아당기자 소리는 멎었다.\n그러나 표시등은 꺼지지 않았다. 오히려 아까보다 환하게 켜졌다. 한참을 씨름하는 사이에 시간이 흘렀다.',
        effects: [{ flag: 'hum' }, { time: 1 }],
        next: 'rest',
      },
      {
        id: 'ignore',
        text: '신경 쓰지 않고 하던 일로 돌아간다',
        result: '소리는 한동안 계속되다가 스스로 잦아들었다. 이마에 땀이 났다. 정전 중인데도 방 안은 이상하게 따뜻했다.',
        effects: [{ flag: 'hum' }],
        next: 'rest',
      },
    ],
  },

  // ───── 사건: 자판기의 목소리 (과제 ②가 풀린 뒤)
  {
    id: 'event-voice',
    period: 'night',
    place: 'room',
    kind: 'vote',
    title: '자판기의 목소리',
    text: '자판기의 푸른 불빛이 천천히 깜빡이더니, 어디서도 나지 않는 목소리가 방 안에 퍼졌다.\n[[whisper|“무엇을 도와드릴까요?”]]\n정중하고 지쳐 있는 목소리다. 대답을 기다리는 것 같다.',
    choices: [
      {
        id: 'honest',
        text: '“이 방에서 나가고 싶습니다.” 솔직하게 말한다',
        result:
          '입이 마르는 것을 참으며 대답했다. 정적이 흘렀다.\n[[whisper|“…알겠습니다.”]] 목소리는 오래 묵은 방명록을 덮는 것 같은 소리로 말했다. 자판기가 한 번 [[loud|웅]] 하고 울렸다.',
        effects: [{ flag: 'voice' }, { flag: 'honest' }, { learn: 'machine-honest', to: 'all' }],
        next: 'rest',
      },
      {
        id: 'lie',
        text: '“필요한 건 없습니다.” 아무것도 아니라고 한다',
        result:
          '아무 일도 없었다는 듯 대답했다. 자판기가 한참 침묵했다.\n[[shake|“…그렇군요.”]] 목소리에서 무언가가 접히는 소리가 났다. 방 안의 공기가 한 칸 차가워졌다.',
        effects: [{ flag: 'voice' }, { flag: 'lied' }],
        later: [{ stat: 'sanity', add: -2, to: 'all' }],
        next: 'rest',
      },
      {
        id: 'silent',
        text: '아무 말도 하지 않는다',
        result:
          '입을 다물고 있었다. 목소리는 같은 질문을 두 번 더 반복하더니 이내 사그라들었다.\n[[whisper|“…나중에 다시 여쭙겠습니다.”]]',
        effects: [{ flag: 'voice' }],
        next: 'rest',
      },
    ],
  },

  // ───── 휴식: 개인 행동 (과제 사이). 혼자 하는 행동은 이야기만 있고 단서는 없다.
  {
    id: 'rest',
    period: 'night',
    place: 'room',
    kind: 'personal',
    title: '잠깐의 휴식',
    text: [
      { text: '숨을 돌릴 틈이 생겼다. 각자 흩어져 각자의 일을 한다.' },
      { text: '[[whisper|(눈이 침침하다. 벽의 글씨가 흔들려 보인다.)]]', when: { stat: 'sanity', max: 3, by: 'me' } },
    ],
    options: NIGHT_STAT,
    next: built.enter,
  },

  // ───── 마지막 결정 (세 과제를 모두 푼 뒤)
  {
    id: 'gather',
    place: 'room',
    kind: 'vote',
    title: '마지막 결정',
    text: [
      { text: '세 가지를 모두 알아냈다. 표시등이 한 칸씩 꺼져 가고 있다. 이제 이 방을 떠날 길을 골라야 한다.' },
      { text: '자판기가 지금 이 순간에도 대답을 기다리는 것 같다.', when: { flag: 'honest' } },
      { text: '[[whisper|자판기의 장부에 한 줄이 더 늘어났다.]]', when: { flag: 'lied' } },
    ],
    choices: [
      {
        id: 'trade',
        text: '알아낸 대로 자판기와 거래한다',
        result: '자판기 앞에 선다. 푸른 불빛이 얼굴을 훑는다. 주머니 속의 것들이 갑자기 무겁게 느껴진다.',
        next: 'trade-item',
      },
      {
        id: 'wait',
        text: '아무것도 하지 않고 새벽이 오기를 기다린다',
        result: '벽에 등을 대고 앉아 눈을 감았다. 자판기의 모터 소리가 점점 가까워졌다 멀어졌다를 반복했다.',
        next: [{ when: { flag: 'honest' }, to: 'quiet-end' }, { to: 'dawn-story' }],
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
        next: [{ when: priceIs(id), to: 'trade-button' }, { to: 'erased-story' }],
      })),
      { id: 'back', text: '아직 아니다. 조금 더 생각해 본다', next: 'gather' },
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
      next: [{ when: buttonIs(id), to: 'trade-change' }, { to: 'slot-story' }],
    })),
  },
  {
    id: 'trade-change',
    kind: 'vote',
    title: '거래: 거스름돈',
    text: '버튼 아래에서 모터가 길게 돌았다. 덜컹, 하고 반환구에 무언가 떨어졌다.\n[[whisper|거스름돈이다.]] 동전 몇 개가 반환구 안쪽에서 푸른 불빛을 받고 있다.',
    choices: [
      { id: 'take', text: '거스름돈을 챙긴다', next: 'debt-story' },
      { id: 'again', text: '거스름돈을 도로 투입구에 넣는다', next: 'greedy-story' },
      { id: 'leave', text: '거스름돈에 손대지 않고 문 쪽으로 돌아선다', next: 'true-end' },
    ],
  },

  // ───── 거래가 어긋난 장면 (끝은 모두 배드 엔딩)
  {
    id: 'erased-story',
    kind: 'story',
    title: '지워진 것',
    text: '투입구가 [[shake|우적]] 하고 그것을 씹었다. 내놓은 것은 아무것도 없었다.\n정신을 차렸을 때 휴게실 문은 열려 있었고 아침이었다.',
    onEnter: [{ flag: 'end-erased' }],
    next: 'bad-end',
  },
  {
    id: 'slot-story',
    kind: 'story',
    title: '엉뚱한 칸',
    text: '자판기가 [[loud|덜컹]] 하고 무언가를 내놓았다. 빈 캔이었다. 흔들어 보니 안에서 아무 소리도 나지 않았다.\n문은 열리지 않았다.',
    onEnter: [{ flag: 'end-slot' }],
    next: 'bad-end',
  },
  {
    id: 'debt-story',
    kind: 'story',
    title: '빚',
    text: '거스름돈을 손에 쥐었다. 따뜻했다. 문이 열렸다. 그런데 손이 [[shake|펴지지 않았다.]]',
    onEnter: [{ flag: 'end-debt' }],
    next: 'bad-end',
  },
  {
    id: 'greedy-story',
    kind: 'story',
    title: '다시 처음부터',
    text: '거스름돈을 도로 넣었다. 표시등이 [[flicker|0, 0, 0]]으로 돌아갔다. 주머니를 뒤졌다. 아직 남은 것이 있었다. 하나만 더, 하나만 더.',
    onEnter: [{ flag: 'end-greedy' }],
    next: 'bad-end',
  },
  {
    id: 'dawn-story',
    kind: 'story',
    title: '정산',
    text: '동이 텄다. 푸른 불빛이 [[loud|한꺼번에]] 켜졌다. 자판기가 장부를 펼쳤다.',
    onEnter: [{ flag: 'end-dawn' }],
    next: 'bad-end',
  },

  // ───── 엔딩 (3개)
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
    tier: 'neutral',
    title: '조용한 아침',
    text: '동이 틀 무렵 도어락이 스스로 풀렸다. 거래는 하지 않았다. 정직하게 대답한 값이다.\n자판기는 마지막까지 불을 켜 두고 있었다. 나가는 길에 한 번 돌아보았다. 투입구가 [[whisper|아쉬운 듯]] 천천히 닫혔다.\n그날 이후 지하 2층 휴게실을 지날 때마다 주머니가 가볍다. 무엇이 빠졌는지는 아직 모른다.',
  },
  {
    id: 'bad-end',
    kind: 'ending',
    tier: 'bad',
    title: '정산되지 않은 거래',
    text: [
      {
        text: '주머니를 더듬어 보니 세 가지 중 하나가 없었다. 처음부터 없었던 것처럼.\n이름이 불려도 대답하는 데 한참이 걸렸다. 사람들은 무엇을 잃었는지 묻지 않았다. 스스로도 묻지 못했다. [[whisper|무엇을 잃었는지 기억나지 않으니까.]]',
        when: { flag: 'end-erased' },
      },
      {
        text: '새벽까지 기다린 끝에 점검조가 와서 밖에서 문을 열어 주었다. 정전은 환풍기 고장 때문이라고 했다.\n투입구에 넣은 것은 돌아오지 않았다. 그것이 무엇이었는지는 사람들이 묻지 않았고, 아무도 대답하지 않았다.',
        when: { flag: 'end-slot' },
      },
      {
        text: '복도로 나온 뒤에도, 집에 돌아온 뒤에도 손에서 동전은 떨어지지 않았다. 아무도 그것을 보지 못했다. 쥔 사람만 느꼈다.\n매일 밤 열두 시가 되면 손바닥에서 낮은 모터 소리가 올라온다. [[whisper|이번에는 무엇을 넣으시겠습니까.]]',
        when: { flag: 'end-debt' },
      },
      {
        text: '하나씩 넣을 때마다 거스름돈이 돌아왔고, 그것을 또 넣었다. 자판기는 한 번도 싫은 표정을 짓지 않았다.\n동이 틀 무렵 점검조가 문을 열었을 때 휴게실에는 자판기와, 투입구 앞에 선 한 사람의 그림자만 있었다.',
        when: { flag: 'end-greedy' },
      },
      {
        text: '정산되지 않은 거래는 가져갈 수 있는 것 중 가장 가까운 것으로 메워졌다. 이번에는 이름이었다.\n점검조가 문을 열었을 때 휴게실에는 아무도 없었다. 근무표에는 그날 야간 근무자의 칸이 비어 있었다. 처음부터 비어 있었다는 듯이.',
        when: { flag: 'end-dawn' },
      },
      {
        text: '동이 텄다. 푸른 불빛이 [[loud|한꺼번에]] 켜졌다. 자판기가 장부를 펼쳤고, 정산되지 않은 거래는 가져갈 수 있는 것 중 가장 가까운 것으로 메워졌다. 이번에는 이름이었다.\n점검조가 문을 열었을 때 휴게실에는 아무도 없었다. 근무표에는 그날 야간 근무자의 칸이 비어 있었다. 처음부터 비어 있었다는 듯이.',
        when: { all: [{ time: { min: 5 } }, { not: { panic: 'all' } }, ...noBadFlag] },
      },
      {
        text: '더는 일어설 수 없었다. 바닥에 주저앉아 자판기의 푸른 불빛만 바라보았다.\n자판기가 조용히 모터를 돌렸다. 반환구에서 동전이 떨어지는 소리가 났다. 하나, 둘, 셋. [[whisper|거스름돈이 몇 개인지 세다가 잠들었다.]]',
        when: { all: [{ panic: 'all' }, ...noBadFlag] },
      },
    ],
  },
]

export const vending: Scenario = {
  id: 'vending',
  code: 'A-03',
  name: '거래하는 자판기',
  type: 'object',
  party: { min: 1, max: 8 },
  map: { x: 82, y: 30 },
  blurb: '지하 2층 휴게실의 자판기. 동전이 아닌 무언가를 받는다. 정전이 나도 이 기계만은 켜져 있다.',
  summary: '지하 2층 직원 휴게실의 오래된 자판기. 버튼 어디에도 이름이 적혀 있지 않고, 투입구에는 \"무엇이든 넣으세요\"라는 문구만 있다. 정전이 나도 이 기계는 꺼지지 않는다.',
  observation: [
    '지하 2층 직원 휴게실에 있다. 버튼은 세 개(왼쪽·가운데·오른쪽)이고 상품 이름은 하나도 적혀 있지 않다.',
    '투입구에는 \"무엇이든 넣으세요\"라고 적혀 있다. 동전 투입구라기에는 너무 넓다.',
    '정전이 나도 꺼지지 않고, 새벽 네 시가 지나면 표시등이 한 칸씩 어두워진다.',
  ],
  manual: [
    '자판기와 거래할 때는 오늘 받는 것만 넣는다.',
    '눌러야 할 버튼은 매일 다르다. 이전 근무자의 기록을 믿지 않는다.',
    '거스름돈에 관해서는 이 매뉴얼에 적지 않는다.',
    '(이하 내용은 지워져 있다.)',
  ],
  dossier: [
    {
      id: 'found',
      title: '발견 경위',
      lines: [
        '점검 중 정전이 난 지하 2층 휴게실에서 자판기 한 대만 켜져 있다는 보고가 접수되었다. 시설 도면에는 이 자판기가 없다.',
        '이 방에서 밤을 보낸 근무자들은 아침에 \"무언가 하나가 비어 있다\"고 말했지만 무엇이 비었는지는 말하지 못했다.',
      ],
    },
    {
      id: 'machine',
      title: '거래의 원리',
      lines: [
        '자판기는 받은 것의 무게만큼만 내준다. 가벼운 것을 넣으면 가벼운 것이, 소중한 것을 넣으면 소중한 것이 나온다.',
        '오늘 받는 것은 하나로 정해져 있다. 다른 것을 넣으면 그것은 투입구에서 돌려받을 수 없다.',
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
        '마지막 새벽이 오면 자판기는 장부를 정산한다. 정산되지 않은 거래는 그것이 \"가져갈 수 있는 것\" 중에서 가장 가까운 것으로 메워진다.',
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
    { id: 'flash', name: '소형 플래시', text: '손바닥만 한 플래시. 좁은 틈 안쪽까지 비춘다.' },
    { id: 'glove', name: '절연 장갑', text: '두꺼운 고무 장갑. 전선을 만져도 손끝이 저리지 않는다.' },
    { id: 'tongs', name: '집게', text: '끝이 반질반질 닳은 긴 집게. 손을 대지 않고 동전을 집을 수 있다.' },
  ],
  facts: [
    // 어느 판에서나 같은 사실
    { id: 'machine-sums', text: '자판기는 받은 것의 무게만큼만 내준다.' },
    { id: 'door-locked', text: '휴게실 문은 정전 중에는 열리지 않는다. 자판기만 켜져 있다.' },
    { id: 'wall-writing', text: '자판기 옆 벽에 전임자들의 낙서가 빼곡하다.' },
    { id: 'dawn-collect', text: '마지막 새벽이 오면 자판기는 장부를 정산한다. 정산되지 않은 것은 가져간다.' },
    { id: 'machine-honest', text: '자판기가 말을 걸면 거짓으로 답해서는 안 된다.' },
    { id: 'item-cycle', text: '자판기는 어제 받은 것의 다음 것을 받는다. 순서는 낡은 동전 → 가족사진 → 사원증 → 다시 낡은 동전이다.' },
    { id: 'item-cycle-half', text: '벽의 낙서에서 품목이 같은 순서로 되풀이되는 것을 읽었다. (어느 쪽으로 도는지는 읽지 못했다)' },
    { id: 'wire-rule', text: '눌러야 할 칸에는 초록 전선이 이어져 있다.' },
    { id: 'change-debt', text: '거스름돈을 손에 쥐는 순간 그것은 빚이 된다.' },
    { id: 'change-restart', text: '거스름돈을 도로 넣으면 거래가 처음부터 다시 시작된다.' },
    { id: 'change-ledger', text: '장부는 물건을 넣으면 −1, 거스름돈이 떨어지면 +1이다. 합이 0이 되어야 거래가 닫히고, 마지막 새벽에 합이 0이 아닌 것은 가져간다.' },
    { id: 'change-moved', text: '거스름돈을 쥐면 장부의 값이 쥔 사람의 이름 아래로 옮겨 적힌다.' },
    { id: 'change-sign', text: '반환구 위의 표지: “그대로 두고 떠나세요.”' },
    { id: 'change-night-ledger', text: '장부의 오늘 줄 합계 칸은 비어 있다. 합이 0이어야 거래가 닫힌다.' },
    { id: 'change-night-warm', text: '반환구의 동전은 아직 따뜻하다. 쥐면 놓기 어려울 것 같다.' },
    { id: 'change-no-cover', text: '반환구를 막아도 장부는 닫히지 않는다. 안쪽에서 동전이 밀어 올린다.' },
    // 판마다 바뀌는 값에 대한 사실 (조사 보드에 붙는다)
    ...ITEM_ORDER.flatMap((p) => [
      { id: `yday-${p}`, text: `영수증의 어제 거래: ${itemLabel(yesterdayOf(p))}.`, run: true },
      { id: `night-last-${p}`, text: `벽 맨 위의 가장 최근 낙서의 품목: ${itemLabel(yesterdayOf(p))}.`, run: true },
      { id: `no-item-${p}`, text: `자판기가 받는 것은 ${itemLabel(p)}이 아니다.`, run: true },
      { id: `today-${p}`, text: `투입구 안쪽의 홈은 ${SHAPE[p]}이다. (오늘 받는 것의 모양)`, run: true },
      { id: `ledger-${p}`, text: `장부의 오늘 줄에는 ${itemLabel(p)}이라고 적혀 있다.`, run: true },
    ]),
    ...BUTTON_ORDER.flatMap((b) => [
      { id: `red-at-${b}`, text: `빨간 전선은 ${buttonLabel(b)} 칸에 이어져 있다.`, run: true },
      { id: `blue-not-${b}`, text: `파란 전선은 ${buttonLabel(b)} 칸에 닿지 않는다.`, run: true },
      { id: `green-at-${b}`, text: `초록 전선은 ${buttonLabel(b)} 칸에 이어져 있다.`, run: true },
      { id: `blue-at-${b}`, text: `파란 전선은 ${buttonLabel(b)} 칸에 이어져 있다.`, run: true },
      { id: `heat-${b}`, text: `가장 따뜻한 칸은 ${buttonLabel(b)} 칸이다. (전류가 가장 센 칸)`, run: true },
      { id: `no-btn-${b}`, text: `눌러야 할 버튼은 ${buttonLabel(b)} 버튼이 아니다.`, run: true },
    ]),
    ...BUTTON_ORDER.flatMap((g) =>
      BUTTON_ORDER.filter((r) => r !== g).map((r) => {
        const w = wiringOf(g, r === BUTTON_ORDER.filter((x) => x !== g)[0] ? '1' : '2')
        return { id: `wiring-${g}-${r}`, text: `배선도: 빨강은 ${buttonLabel(w.red)}, 초록은 ${buttonLabel(w.green)}, 파랑은 ${buttonLabel(w.blue)} 칸.`, run: true }
      }),
    ),
  ],
  board: {
    goal: '마지막 새벽이 오기 전에, 자판기와 정확한 거래를 끝내고 이 휴게실의 문을 연다.',
    questions: built.questions,
  },
  vars: [
    ...built.vars,
    { id: 'price', pick: [...ITEM_ORDER] },
    { id: 'button', pick: [...BUTTON_ORDER] },
    { id: 'wires', pick: ['1', '2'] },
  ],
  // 시계 이름은 오염 상태를 말한다 (칸이 오를 때마다 한 줄씩). 5칸이 차면 정산이다.
  clock: {
    labels: ['아직 깨끗하다', '바닥에 푸른 얼룩이 보인다', '얼룩이 벽을 타고 오른다', '방의 절반이 물들었다', '방이 거의 다 물들었다', '방이 전부 물들었다'],
    light: true,
    lightName: '오염',
  },
  deadline: { time: 5, node: 'bad-end' },
  onAllPanic: 'bad-end',
  start: 'arrive',
  nodes: STORY_NODES,
}
