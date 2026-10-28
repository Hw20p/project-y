// A-03 거래하는 자판기 공략 시험: 의도한 풀이가 모든 인원(1~8명)과 과제 순서에서 진엔딩에 닿는지, 과제마다 단서가 하나의 답으로 모이는지,
// 혼자일 때의 대체 조사, 거래가 어긋난 결말, 조용한 아침·정산·정신 상실.
// (전수 탐색은 탐색기 화면이나 `npm run explore -- vending 1`로 따로 돌린다.)
import assert from 'node:assert/strict'
import { vending as sc, wiringOf, yesterdayOf, type ButtonId, type ItemId, type WiresId } from '../src/content/scenarios/vending.ts'
import { createScenarioGame, reduceScenario, type ScenarioAction } from '../src/scenario/game.ts'
import { partyOf } from '../src/scenario/registry.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import { validateScenario } from '../src/scenario/validate.ts'
import { viewForScenario } from '../src/scenario/view.ts'

const ITEMS: ItemId[] = ['coin', 'photo', 'badge']
const BUTTONS: ButtonId[] = ['A', 'B', 'C']
const TASKS = ['item', 'button', 'change'] as const
const ORDERS = TASKS.flatMap((x) =>
  TASKS.filter((y) => y !== x).map((y) => [x, y, TASKS.find((z) => z !== x && z !== y)!].join('>')),
)

interface Run {
  order: string
  price: ItemId
  button: ButtonId
  wires: WiresId
}
const RUN: Run = { order: ORDERS[0], price: 'coin', button: 'A', wires: '1' }

const act = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(sc, g, a)
const ids = (g: ScenarioGame) => g.run.players.map((p) => p.id)
const ready = (g: ScenarioGame) => ids(g).reduce((s, id) => act(s, { type: 'ready', playerId: id }), g)
const settle = (g: ScenarioGame) => (g.run.phase === 'story' || g.run.phase === 'result' ? ready(g) : g)
const voteAll = (g: ScenarioGame, choiceId: string) => ids(g).reduce((s, id) => act(s, { type: 'vote', playerId: id, choiceId }), g)
const pickEach = (g: ScenarioGame, picks: Record<number, string>, fallback: string) =>
  ids(g).reduce((s, id, i) => act(s, { type: 'pick', playerId: id, actionId: picks[i] ?? fallback }), g)
const view = (g: ScenarioGame, id = 'p1') => viewForScenario(sc, g, id)
const choiceIds = (g: ScenarioGame, id = 'p1') => view(g, id).scene!.choices.map((c) => c.id)

/** 위험한 곳이 아무 조사에도 걸리지 않는 값 (위험한 곳 시험(15)만 특정 조사를 고른다) */
const NO_RISK = { 'risk-item': 'off', 'risk-button': 'off', 'risk-change': 'off' }
const start = (n: number, r: Run = RUN, extra: Record<string, string> = {}) =>
  createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { order: r.order, price: r.price, button: r.button, wires: r.wires, ...NO_RISK, ...extra } })
const toEnd = (g: ScenarioGame) => {
  for (let i = 0; i < 4 && g.run.phase !== 'ended'; i++) g = settle(g)
  return g
}

/** 의도한 답의 선택지 id (받는 것은 추리 사슬이라 `chainRight`가 따로 있다) */
const rightAnswer = (task: (typeof TASKS)[number], r: Run) =>
  task === 'item' ? 'item-reason' : task === 'button' ? `btn-${r.button}` : 'leave'

/**
 * 사람 한 명이 파고들기(조사 뒤에 혼자 이어지는 단계)에서 선택지를 고른다.
 * 판마다 단서가 달라 id 끝이 다른 맞는 보기는 `<조사>-2-good`으로 쓰면 지금 보이는 것을 고른다.
 */
const soloAs = (g: ScenarioGame, playerId: string, choiceId: string): ScenarioGame => {
  if (choiceId.endsWith('-2-good')) {
    const seen = viewForScenario(sc, g, playerId).scene!.solo!.choices.filter((c) => c.id.startsWith(choiceId))
    assert.equal(seen.length, 1, `${choiceId}: 보이는 맞는 보기는 하나다`)
    choiceId = seen[0].id
  }
  return act(g, { type: 'solo', playerId, choiceId })
}
/**
 * 단계형 조사(낙서 읽기)를 끝까지 진행한다: 조사 결과(도입)를 읽고 → 파고들기에서 `who`가 `choices`를 차례로 고르고 → 결과를 읽는다.
 * 끝나면 추리 장면이다.
 */
const digThrough = (g: ScenarioGame, who: string, ...choices: string[]): ScenarioGame => {
  g = settle(g)
  assert.equal(g.run.nodeId, 'item-dig', '단계형 조사를 고른 사람이 있으면 파고들기로 간다')
  for (const c of choices) g = soloAs(g, who, c)
  return settle(g)
}

/** 받는 것의 추리 사슬에서 단계마다 맞는 보기: 규칙 → 도는 방향 → 어제 → 오늘 */
const chainRight = (r: Run) => ['rule-cycle', 'dir-up', `yd-${yesterdayOf(r.price)}`, `item-${r.price}`]

/** 받는 것의 추리를 시작해 `steps`단계까지 맞게 짚는다 (그다음 단계의 투표 장면에서 멈춘다. 0이면 첫 단계 장면) */
const reasonTo = (g: ScenarioGame, steps: number, r: Run = RUN): ScenarioGame => {
  g = voteAll(g, 'item-reason')
  for (let i = 0; i < steps; i++) g = settle(voteAll(g, chainRight(r)[i]))
  return g
}

interface Plan {
  hum: 'listen' | 'unplug' | 'ignore'
  voice: 'honest' | 'lie' | 'silent'
}
const GOOD: Plan = { hum: 'ignore', voice: 'honest' }

/**
 * 의도한 풀이를 따라 `until` 장면까지 간다. 조사에서는 아무도 살피지 않고 기다리고(`<과제>-wait`), 추리에서는 바로 정답을 건다 —
 * 단서를 모으는 길은 아래가 따로 본다.
 */
function drive(g0: ScenarioGame, until: string, r: Run = RUN, plan: Plan = GOOD): ScenarioGame {
  let g = g0
  for (let guard = 0; g.run.nodeId !== until; guard++) {
    assert.ok(guard < 100, `${until}에 닿지 못함 (지금 ${g.run.nodeId})`)
    const n = g.run.nodeId
    const task = TASKS.find((t) => n.startsWith(`${t}-`))
    if (g.run.phase === 'result') g = ready(g)
    else if (n === 'arrive') g = ready(g)
    else if (n === 'first-look') g = pickEach(g, {}, 'pocket')
    else if (task && n === `${task}-probe`) g = pickEach(g, {}, `${task}-wait`)
    else if (task && n === `${task}-think`) g = voteAll(g, rightAnswer(task, r))
    else if (task === 'item' && /^item-c\d$/.test(n)) g = voteAll(g, chainRight(r)[Number(n.slice(-1)) - 1]) // 추리 사슬의 단계
    else if (task) g = ready(g) // 소개·풀렸다·사슬의 근거 이야기
    else if (n === 'event-hum') g = voteAll(g, plan.hum)
    else if (n === 'event-voice') g = voteAll(g, plan.voice)
    else if (n === 'rest') g = pickEach(g, {}, 'coffee')
    else if (n === 'gather') g = voteAll(g, 'trade')
    else throw new Error(`예상하지 못한 장면: ${n}`)
  }
  return g
}

/** 마지막 거래: 넣을 것·버튼·거스름돈을 고른다. 어긋나면 거기서 끝난다. */
function trade(g: ScenarioGame, put: string, press: string, change: string): ScenarioGame {
  g = settle(voteAll(g, `put-${put}`))
  if (g.run.nodeId !== 'trade-button') return toEnd(g)
  g = settle(voteAll(g, `press-${press}`))
  if (g.run.nodeId !== 'trade-change') return toEnd(g)
  return toEnd(voteAll(g, change))
}

// 0) 정적 검증
{
  const r = validateScenario(sc)
  assert.deepEqual(r.errors, [], r.errors.join('\n'))
  assert.deepEqual(r.warnings, [], r.warnings.join('\n'))
  console.log(`통과: 정적 검증 (장면 ${sc.nodes.length}개, 엔딩 ${sc.nodes.filter((n) => n.kind === 'ending').length}개, 1~8인)`)
}

// 1) 의도한 풀이는 모든 인원·모든 과제 순서에서 진엔딩이다 (풀기만 하면 시계는 그대로)
{
  const runs: [ItemId, ButtonId, WiresId][] = [
    ['coin', 'A', '1'],
    ['photo', 'B', '2'],
    ['badge', 'C', '1'],
    ['coin', 'C', '2'],
    ['photo', 'A', '1'],
    ['badge', 'B', '2'],
  ]
  let games = 0
  for (const n of [1, 2, 4, 8]) {
    for (const order of ORDERS) {
      for (const [price, button, wires] of runs) {
        const r: Run = { order, price, button, wires }
        let g = drive(start(n, r), 'trade-item', r)
        assert.equal(g.run.time, 0, '풀기만 하면 시계는 그대로다')
        g = trade(g, price, button, 'leave')
        assert.equal(g.run.endingId, 'true-end', `${n}명 ${order} ${price}/${button}/${wires}`)
        assert.equal(view(g).ending!.tier, 'true')
        games++
      }
    }
  }
  // 받는 것 3 × 버튼 3 × 전선 2 가지를 모두 (2명, 한 가지 순서)
  for (const price of ITEMS)
    for (const button of BUTTONS)
      for (const wires of ['1', '2'] as const) {
        const r: Run = { ...RUN, price, button, wires }
        const g = trade(drive(start(2, r), 'trade-item', r), price, button, 'leave')
        assert.equal(g.run.endingId, 'true-end', `${price}/${button}/${wires}`)
        games++
      }
  console.log(`통과: 의도한 풀이로 진엔딩 (${games}판: 1·2·4·8명 × 과제 순서 6, 받는 것·버튼·전선 모든 경우)`)
}

// 2) 받는 것(순서형): 순서가 한 바퀴 돌고, 어제의 기록에서 한 칸 뒤가 오늘이다
{
  assert.deepEqual(ITEMS.map(yesterdayOf), ['badge', 'coin', 'photo'], '어제: 동전은 사원증 다음, 사진은 동전 다음, 사원증은 사진 다음')
  const next = (p: ItemId) => ITEMS[(ITEMS.indexOf(p) + 1) % 3]
  for (const p of ITEMS) assert.equal(next(yesterdayOf(p)), p, `${p}: 어제의 다음이 오늘`)
  console.log('통과: 받는 것 — 어제 받은 것의 다음 것이 오늘의 품목')
}

// 3) 버튼(대응형): 빨간 선 위치와 "파란 선은 이 칸이 아니다"를 맞추면 전선 짝이 하나로 정해지고, 그 칸이 눌러야 할 버튼이다
{
  const COLORS = ['red', 'blue', 'green'] as const
  const perms = (): Record<(typeof COLORS)[number], ButtonId>[] => {
    const out: Record<(typeof COLORS)[number], ButtonId>[] = []
    for (const r of BUTTONS) for (const b of BUTTONS) for (const g of BUTTONS) if (new Set([r, b, g]).size === 3) out.push({ red: r, blue: b, green: g })
    return out
  }
  for (const button of BUTTONS) {
    for (const wires of ['1', '2'] as const) {
      const w = wiringOf(button, wires)
      assert.equal(new Set([w.red, w.blue, w.green]).size, 3, '세 선은 서로 다른 칸에 이어진다')
      assert.equal(w.green, button, '눌러야 할 칸에 초록 선이 닿는다')
      // 단서: 빨간 선은 w.red 칸 / 파란 선은 w.green 칸이 아니다 (+ 규칙: 초록이 눌러야 할 칸)
      const consistent = perms().filter((p) => p.red === w.red && p.blue !== w.green)
      assert.equal(consistent.length, 1, `${button}/${wires}: 두 단서를 맞추면 짝이 하나로 정해진다`)
      assert.equal(consistent[0].green, button)
    }
  }
  console.log('통과: 버튼 — 전선 단서를 맞추면 눌러야 할 칸이 하나로 정해진다')
}

// 4) 혼자와 여럿: 둘이 해야 열리는 조사는 혼자일 때 보이지 않고, 같은 정보를 얻는 대체 조사가 있다
{
  const toProbe = (n: number, task: (typeof TASKS)[number]) => {
    const r: Run = { ...RUN, order: `${task}>${TASKS.filter((t) => t !== task).join('>')}` }
    let g = start(n, r)
    for (const node of ['arrive', 'first-look', `${task}-intro`]) {
      assert.equal(g.run.nodeId, node)
      g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
    }
    assert.equal(g.run.nodeId, `${task}-probe`)
    return g
  }
  // 받는 것: 혼자는 1단계에서 하나씩만 얻는다 → 한 번 넘기면 2단계에 혼자 쓰는 조사가 열린다
  let solo = toProbe(1, 'item')
  assert.deepEqual(choiceIds(solo), ['graffiti', 'receipt', 'trash', 'display', 'cabinet', 'item-wait'], '처음에는 1단계 조사만 (알아낼 것이 없는 곳·아이템을 얻는 곳 포함)')
  solo = digThrough(pickEach(solo, {}, 'graffiti'), 'p1', 'graffiti-1-date', 'graffiti-2a-order')
  assert.equal(solo.run.nodeId, 'item-think')
  solo = settle(voteAll(solo, 'item-pass'))
  assert.equal(solo.run.time, 1)
  assert.equal(solo.run.nodeId, 'item-night', '패스하면 밤이 온다')
  solo = settle(pickEach(solo, {}, 'coffee'))
  assert.deepEqual(choiceIds(solo), ['receipt', 'trash', 'display', 'cabinet', 'slot', 'tray-solo', 'item-wait'], '혼자: 둘이 하는 조사 대신 혼자 쓰는 조사')
  let duo = toProbe(2, 'item')
  duo = settle(pickEach(settle(voteAll(pickEach(duo, {}, 'item-wait'), 'item-pass')), {}, 'coffee'))
  assert.deepEqual(choiceIds(duo), ['graffiti', 'receipt', 'trash', 'display', 'cabinet', 'slot', 'tray-pair', 'item-wait'], '둘: 함께하는 조사가 열리고 혼자 쓰는 조사는 없다')
  assert.equal(view(duo).scene!.choices.find((c) => c.id === 'tray-pair')!.min, 2)
  // 버튼: 혼자는 직접 확인(정신력이 든다), 둘은 함께 비교(대가 없음)
  let btn = toProbe(1, 'button')
  btn = settle(pickEach(settle(voteAll(pickEach(btn, {}, 'button-wait'), 'button-pass')), {}, 'coffee'))
  assert.ok(choiceIds(btn).includes('peek') && !choiceIds(btn).includes('pair'))
  // 함께 비교하면 둘 다 초록 선의 위치를 안다
  let pair = toProbe(2, 'button')
  pair = settle(pickEach(settle(voteAll(pickEach(pair, {}, 'button-wait'), 'button-pass')), {}, 'coffee'))
  const before = pair.run.players.map((p) => p.stats.sanity)
  pair = settle(pickEach(pair, { 0: 'pair', 1: 'pair' }, 'button-wait'))
  assert.ok(view(pair).clues.some((c) => c.id === 'green-at-A'))
  assert.deepEqual(pair.run.players.map((p) => p.stats.sanity), before, '함께 비교하는 데는 대가가 없다')
  console.log('통과: 혼자와 여럿의 조사 (대체 조사·함께하는 조사)')
}

// 5) 과제 사이: 첫 과제 뒤 혼자 울리는 소리 → 휴식, 둘째 과제 뒤 자판기의 목소리 → 휴식, 셋째 뒤 바로 마지막 결정
{
  const g = drive(start(2), 'gather')
  const v = g.run.visited
  const pos = (id: string) => v.indexOf(id)
  const [first, second, third] = RUN.order.split('>')
  assert.ok(pos(`${first}-right`) < pos('event-hum') && pos('event-hum') < pos('rest'))
  assert.ok(pos(`${second}-intro`) > pos('rest'))
  assert.ok(pos(`${second}-right`) < pos('event-voice'))
  assert.equal(v.filter((x) => x === 'rest').length, 2)
  assert.ok(pos(`${third}-right`) < pos('gather') && v.indexOf('rest', pos(`${third}-right`)) === -1)
  console.log('통과: 과제 사이의 사건과 휴식')
}

// 6) 오답·패스: 시계(새벽)가 한 칸 가고, 오답은 정신력도 깎는다. 조명 표시는 없다.
{
  const r: Run = { ...RUN, order: 'item>button>change' }
  let g = start(2, r)
  for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
  g = settle(pickEach(g, {}, 'item-wait'))
  assert.deepEqual(view(g).light, { max: 5, level: 0, name: '오염' }, '자판기의 시계는 "오염"이라는 이름의 조명 수치다')
  assert.equal(view(g).meter, null)
  const sanity = g.run.players[0].stats.sanity
  const wrong = voteAll(reasonTo(g, 3), 'item-badge') // 마지막 단계에서 틀렸다
  assert.equal(wrong.run.time, 1)
  assert.equal(view(wrong).clockLabel, '바닥에 푸른 얼룩이 보인다')
  assert.equal(view(wrong).light!.level, 1, '오답으로 오염이 한 칸 오른다')
  for (const p of wrong.run.players) assert.equal(p.stats.sanity, sanity - 2)
  assert.ok(wrong.run.players.every((p) => p.facts.includes('no-item-badge')), '오답이었음을 모두가 안다')
  const passed = voteAll(g, 'item-pass')
  assert.equal(passed.run.time, 1)
  for (const p of passed.run.players) assert.equal(p.stats.sanity, sanity, '패스는 정신력을 깎지 않는다')
  console.log('통과: 오답·패스의 대가 (시계, 정신력)')
}

// 7) 거래가 어긋난 결말은 모두 배드 엔딩이고 본문만 다르다
{
  const atTrade = (plan: Plan = GOOD) => drive(start(2), 'trade-item', RUN, plan)
  const text = (g: ScenarioGame) => view(g).ending!.text
  const wrongItem = trade(atTrade(), 'photo', 'A', 'leave')
  assert.equal(wrongItem.run.endingId, 'bad-end')
  assert.match(text(wrongItem), /세 가지 중 하나가 없었다/, '틀린 품목')
  assert.equal(view(wrongItem).ending!.tier, 'bad')
  const wrongBtn = trade(atTrade(), 'coin', 'B', 'leave')
  assert.equal(wrongBtn.run.endingId, 'bad-end')
  assert.match(text(wrongBtn), /환풍기 고장/, '틀린 버튼')
  assert.match(text(trade(atTrade(), 'coin', 'A', 'take')), /동전은 떨어지지 않았다/, '거스름돈을 챙김')
  assert.match(text(trade(atTrade(), 'coin', 'A', 'again')), /그림자만 있었다/, '거스름돈을 도로 넣음')
  // 거래 직전에 되돌아와 다시 정할 수 있다
  const back = settle(voteAll(atTrade(), 'back'))
  assert.equal(back.run.nodeId, 'gather')

  // 기다리기: 정직하게 답했으면 조용한 아침(일반), 아니면 정산(배드)
  const waitEnd = (voice: Plan['voice']) => {
    const g = settle(voteAll(drive(start(2), 'gather', RUN, { hum: 'ignore', voice }), 'wait'))
    return toEnd(g)
  }
  const quiet = waitEnd('honest')
  assert.equal(quiet.run.endingId, 'quiet-end')
  assert.equal(view(quiet).ending!.tier, 'neutral')
  for (const voice of ['lie', 'silent'] as const) {
    const g = waitEnd(voice)
    assert.equal(g.run.endingId, 'bad-end', voice)
    assert.match(text(g), /근무표/)
  }
  console.log('통과: 엔딩 3개 (진엔딩·조용한 아침·정산되지 않은 거래의 원인별 본문)')
}

// 8) 시계가 끝에 닿으면 정산되고, 정신을 모두 잃으면 정신 상실
{
  // 패스를 계속하면 새벽이 온다
  let g = start(2)
  for (let i = 0; i < 160 && g.run.phase !== 'ended'; i++) {
    const n = g.run.nodeId
    if (g.run.phase === 'result') g = ready(g)
    else if (n === 'first-look') g = pickEach(g, {}, 'pocket')
    else if (n.endsWith('-probe')) g = pickEach(g, {}, `${n.split('-')[0]}-wait`)
    else if (n.endsWith('-think')) g = voteAll(g, `${n.split('-')[0]}-pass`)
    else if (n.endsWith('-night') && g.run.phase === 'personal') g = pickEach(g, {}, 'coffee')
    else g = ready(g)
  }
  assert.equal(g.run.endingId, 'bad-end')
  assert.equal(g.run.time, 5)
  assert.match(view(g).ending!.text, /근무표/)

  // 정신력이 바닥인 파티가 오답을 고르면
  const r: Run = { ...RUN, order: 'item>button>change' }
  let c = start(2, r)
  for (const node of ['arrive', 'first-look', 'item-intro']) c = node === 'first-look' ? settle(pickEach(c, {}, 'pocket')) : ready(c)
  c = settle(pickEach(c, {}, 'item-wait'))
  c = structuredClone(c)
  for (const p of c.run.players) p.stats.sanity = 2
  c = voteAll(reasonTo(c, 3), 'item-badge')
  assert.equal(c.run.endingId, 'bad-end')
  assert.match(view(c).ending!.text, /더는 일어설 수 없었다/)
  console.log('통과: 시계가 끝나면 정산, 정신을 모두 잃으면 정신 상실')
}

// 9) 사건: 소리는 정신력을 깎는 대신 정산 규칙을 알려 주고, 코드를 뽑으면 시계가 가고, 목소리에 거짓으로 답하면 정신력이 깎인다
{
  const atHum = drive(start(2), 'event-hum')
  const heard = ready(voteAll(atHum, 'listen'))
  assert.ok(heard.run.players.every((p) => p.facts.includes('dawn-collect')))
  const unplugged = voteAll(atHum, 'unplug')
  assert.equal(unplugged.run.time, atHum.run.time + 1)
  const atVoice = drive(start(2), 'event-voice')
  const before = atVoice.run.players.map((p) => p.stats.sanity)
  const lied = ready(voteAll(atVoice, 'lie')) // 거짓 답의 대가는 다음 장면에 들어오며 적용된다
  assert.deepEqual(lied.run.players.map((p) => p.stats.sanity), before.map((x) => x - 2))
  console.log('통과: 사건(혼자 울리는 소리·자판기의 목소리)')
}

// 10) 단서는 얻은 사람 이름과 함께 모두에게 보이고, 지금 과제가 보드에서 강조된다
{
  const r: Run = { ...RUN, order: 'button>item>change' }
  let g = start(2, r)
  for (const node of ['arrive', 'first-look', 'button-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
  // 안내문·귀 대기는 단계형이라, 각자 두 번 맞게 고르고 나서야 단서가 나온다
  g = settle(pickEach(g, { 0: 'notice', 1: 'ear' }, 'button-wait'))
  g = settle(soloAs(soloAs(soloAs(soloAs(g, 'p1', 'notice-1-good'), 'p1', 'notice-2-good'), 'p2', 'ear-1-good'), 'p2', 'ear-2-good'))
  const seen = view(g, 'p2').clues.map((c) => [c.id, c.by.map((b) => b.id)])
  assert.deepEqual(seen, [
    ['wire-rule', ['p1']],
    ['red-at-B', ['p2']],
  ], '상대가 얻은 단서도 이름과 함께 보인다')
  const q = view(g).board!.questions
  assert.deepEqual(q.filter((x) => x.current).map((x) => x.id), ['button'])
  assert.ok(q.filter((x) => x.id !== 'button').every((x) => x.text === null), '아직 안 한 과제는 숨는다')
  console.log('통과: 단서 공개와 지금 과제 표시')
}

// 11) 오답 뒤의 밤: 과제의 단서 선택지가 나오고(이미 아는 단서는 숨는다), 아이템은 낮의 조사에서만 얻는다.
//     밤에는 가진 아이템을 쓰는 선택지만 있다. 과제를 푼 뒤의 휴식에는 스텟 선택지뿐이다.
{
  const r: Run = { ...RUN, order: 'item>button>change' } // 오늘 받는 것은 낡은 동전, 어제는 사원증
  let g = start(2, r)
  for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
  g = settle(pickEach(g, { 1: 'cabinet' }, 'item-wait')) // 한 명이 낮에 서랍에서 플래시를 얻는다
  assert.deepEqual(g.run.players.map((p) => p.items.includes('flash')), [false, true], '낮의 조사로 플래시를 얻었다')
  g = voteAll(reasonTo(g, 3), 'item-badge') // 사원증이라고 걸었다가 틀렸다
  g = settle(g)
  assert.equal(g.run.nodeId, 'item-night')
  // 어제 받은 것(사원증)이 아니라는 것은 오답으로 이미 밝혀졌으므로 "투입구 소리" 선택지는 숨는다. 밤에는 아이템을 얻는 선택지가 없다.
  assert.deepEqual(choiceIds(g), ['dates-coin', 'coffee', 'study'])
  assert.ok(choiceIds(g, 'p2').includes('lit-night-coin') && !choiceIds(g, 'p1').includes('lit-night-coin'), '플래시를 쓰는 밤 선택지는 가진 사람에게만 보인다')
  g = settle(pickEach(g, { 0: 'dates-coin' }, 'coffee'))
  assert.equal(g.run.nodeId, 'item-probe')
  assert.deepEqual(view(g, 'p2').clues.filter((c) => c.id === 'night-last-coin').map((c) => c.by.map((b) => b.id)), [['p1']])
  assert.ok(choiceIds(g, 'p2').includes('lit') && !choiceIds(g, 'p1').includes('lit'), '플래시를 가진 사람에게만 낮의 조사도 열린다')
  assert.ok(!choiceIds(g, 'p1').includes('cabinet') && !choiceIds(g, 'p2').includes('cabinet'), '누가 플래시를 가졌으면 서랍은 보이지 않는다')
  const lit = digThrough(pickEach(g, { 1: 'lit' }, 'item-wait'), 'p2', 'lit-1-good', 'lit-2-good-0') // 플래시 비추기는 단계형 조사다
  assert.ok(view(lit).clues.some((c) => c.id === 'today-coin' && c.by.some((b) => b.id === 'p2')))

  // 과제를 푼 뒤의 휴식에는 스텟 선택지뿐이다
  assert.deepEqual(choiceIds(drive(start(2), 'rest')), ['coffee', 'study'])
  console.log('통과: 오답 뒤의 밤(단서·아이템·숨김)과 푼 뒤의 휴식')
}

// 12) 위험한 곳: 뽑힌 조사를 살핀 사람만 대가를 치르고 단서는 그대로 얻는다. 다친 사람은 몸을 쓰는 조사를 못 한다.
{
  const r: Run = { ...RUN, order: 'item>button>change' }
  // 받는 것: 영수증이 위험한 곳이면 읽은 사람만 다친다 (그래도 어제 거래는 알아낸다)
  let g = start(2, r, { 'risk-item': 'receipt' })
  for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
  g = pickEach(g, { 0: 'receipt', 1: 'graffiti' }, 'item-wait')
  assert.deepEqual(g.run.players.map((p) => p.hurt), [true, false])
  assert.match(view(g, 'p1').result!.mine!.text, /글자가 잉크처럼 번져/)
  // 영수증·낙서는 단계형 조사라, 단서는 파고들기를 맞게 마친 뒤에 나온다
  g = settle(soloAs(soloAs(soloAs(soloAs(settle(g), 'p1', 'receipt-1-good'), 'p1', 'receipt-2-good'), 'p2', 'graffiti-1-date'), 'p2', 'graffiti-2a-order'))
  assert.ok(g.run.players[0].facts.includes('yday-coin'), '다쳐도 어제 거래는 알아낸다')

  // 거스름돈: 위험한 곳은 정신력 −3 (낙서를 읽은 사람만)
  let c = start(2, { ...RUN, order: 'change>item>button' }, { 'risk-change': 'wall' })
  for (const node of ['arrive', 'first-look', 'change-intro']) c = node === 'first-look' ? settle(pickEach(c, {}, 'pocket')) : ready(c)
  const s0 = c.run.players.map((p) => p.stats.sanity)
  c = pickEach(c, { 0: 'wall', 1: 'tray-paper' }, 'change-wait')
  assert.equal(c.run.players[0].stats.sanity, s0[0] - 3)
  assert.equal(c.run.players[1].stats.sanity, s0[1])

  // 거스름돈의 답에 "막는다"가 더해졌고, 틀린 답이며 모두가 알게 된다
  c = settle(soloAs(soloAs(soloAs(soloAs(settle(c), 'p1', 'wall-1-good'), 'p1', 'wall-2-good-0'), 'p2', 'tray-paper-1-good'), 'p2', 'tray-paper-2-good-0')) // 낙서·종이도 단계형이다
  assert.equal(c.run.nodeId, 'change-think')
  const cover = voteAll(c, 'cover')
  assert.ok(cover.run.players.every((p) => p.facts.includes('change-no-cover')))
  console.log('통과: 위험한 곳(자판기)과 거스름돈의 새 오답')
}

// 13) 받는 것의 추리 사슬: 추리 장면은 "시작 / 더 조사" 둘뿐이고, 단계마다 근거가 밝혀지며, 틀리면 그 시도가 거기서 끝난다
{
  const r: Run = { ...RUN, order: 'item>button>change' } // 오늘 받는 것은 낡은 동전, 어제는 사원증
  const text = (g: ScenarioGame) => view(g).scene!.text
  /** 받는 것의 조사를 마치고 추리 장면에 선 상태 */
  const atThink = (picks: Record<number, string>, dig: Record<string, string[]> = {}) => {
    let g = start(2, r)
    for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
    g = settle(pickEach(g, picks, 'item-wait'))
    // 낙서·영수증 읽기는 단계형이라, 고른 사람이 파고들기에서 `dig`(조사 id → 선택)를 차례로 하고 나서야 추리 장면이 된다
    const diggers = Object.entries(picks).filter(([, a]) => a in dig)
    if (diggers.length > 0) {
      assert.equal(g.run.nodeId, 'item-dig')
      for (const [i, a] of diggers) for (const c of dig[a]) g = soloAs(g, g.run.players[Number(i)].id, c)
      g = settle(g)
    }
    return g
  }

  // 추리 장면에는 둘뿐이고, 시작하면 4단계 사슬이 이어진다
  const blind = atThink({})
  assert.equal(blind.run.nodeId, 'item-think')
  assert.deepEqual(choiceIds(blind), ['item-reason', 'item-pass'])
  let g = voteAll(blind, 'item-reason')
  assert.equal(g.run.nodeId, 'item-c1')
  assert.deepEqual([...choiceIds(g)].sort(), ['rule-cycle', 'rule-mood', 'rule-price', 'rule-random', 'rule-same'], '보기 순서는 판마다 섞이므로 목록만 본다')
  assert.equal(view(g).scene!.title, '받는 것 · 추리 1/4')
  // 단서 없이 맞히면 근거가 아니라 감이었다고 밝혀진다. 맞게 짚는 동안 시계는 그대로다.
  g = voteAll(g, 'rule-cycle')
  assert.equal(g.run.nodeId, 'item-c1-ok')
  assert.match(text(g), /근거 없이 감이 닿았을 뿐/)
  g = settle(g)
  assert.equal(g.run.nodeId, 'item-c2')
  assert.equal(g.run.time, 0)

  // 단서를 얻었으면 그 단서가 근거로 밝혀지고, 끝까지 맞으면 풀린다
  const informed = atThink({ 0: 'graffiti', 1: 'receipt' }, { graffiti: ['graffiti-1-date', 'graffiti-2a-order'], receipt: ['receipt-1-good', 'receipt-2-good'] })
  assert.equal(informed.run.nodeId, 'item-think')
  let h = voteAll(voteAll(informed, 'item-reason'), 'rule-cycle')
  assert.match(text(h), /낙서가 근거였다/)
  h = voteAll(settle(h), 'dir-up')
  assert.match(text(h), /가벼운 것에서 소중한 것으로/)
  h = voteAll(settle(h), 'yd-badge')
  assert.match(text(h), /영수증이 근거였다/)
  assert.match(text(h), /어제 자판기가 받은 것은 사원증이다/)
  h = voteAll(settle(h), 'item-coin')
  assert.equal(h.run.nodeId, 'item-right')
  assert.match(text(h), /그다음 차례는 낡은 동전이다/)
  assert.match(text(h), /맞다\. 오늘 밤 이 기계가 받는 것은 낡은 동전이다/)

  // 의도한 풀이는 사슬의 모든 장면을 거친다
  const solved = drive(start(2, r), 'trade-item', r)
  for (const id of ['item-reason', 'item-c1', 'item-c1-ok', 'item-c2', 'item-c2-ok', 'item-c3', 'item-c3-ok', 'item-c4', 'item-right']) {
    if (id !== 'item-reason') assert.ok(solved.run.visited.includes(id), id)
  }

  // 틀리면 그 시도가 거기서 끝난다: 오답의 대가(시계·정신력)와 밤이 이어진다
  const s0 = blind.run.players[0].stats.sanity
  let w = voteAll(voteAll(blind, 'item-reason'), 'rule-random')
  assert.equal(w.run.nodeId, 'item-c1-wrong-rule-random-1')
  assert.equal(w.run.time, 1)
  for (const p of w.run.players) assert.equal(p.stats.sanity, s0 - 2)
  w = settle(w)
  assert.equal(w.run.nodeId, 'item-night')
  // 틀린 시도도 패스처럼 조사 선택지를 한 단계 연다 (두 번째 이후는 다른 장면이고 3단계까지 열린다)
  w = settle(pickEach(w, {}, 'coffee'))
  assert.equal(w.run.nodeId, 'item-probe')
  assert.ok(choiceIds(w).includes('slot') && !choiceIds(w).includes('ledger'), '한 번 틀리면 2단계 조사')
  w = settle(pickEach(w, {}, 'item-wait'))
  w = voteAll(reasonTo(w, 1), 'dir-down') // 첫 단계는 맞고 둘째 단계에서 틀렸다
  assert.equal(w.run.nodeId, 'item-c2-wrong-dir-down-2')
  assert.equal(w.run.time, 2)
  w = settle(pickEach(settle(w), {}, 'coffee'))
  assert.ok(choiceIds(w).includes('ledger'), '두 번 틀리면 3단계 조사')

  // 마지막 단계에서 틀리면 그 답이 아니라고 모두가 알게 되고, 다음 시도의 질문에 덧붙는다
  let q = voteAll(reasonTo(blind, 3), 'item-badge')
  assert.ok(q.run.players.every((p) => p.facts.includes('no-item-badge')))
  q = settle(pickEach(settle(q), {}, 'coffee'))
  q = settle(pickEach(q, {}, 'item-wait'))
  q = reasonTo(q, 3)
  assert.equal(q.run.nodeId, 'item-c4')
  assert.match(text(q), /사원증은 이미 아니라고 밝혀졌다/)
  console.log('통과: 받는 것의 추리 사슬 (4단계·근거 이야기·틀리면 그 시도 종료)')
}

// 14) 조사: 알아낼 것이 없는 곳은 단서 없이 이야기만 남기고, 휴지통 종이는 영수증과 같은 단서(어제의 거래)를 준다
{
  const r: Run = { ...RUN, order: 'item>button>change' } // 오늘 받는 것은 낡은 동전, 어제는 사원증
  const toProbe = (picks: Record<number, string>) => {
    let g = start(2, r)
    for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
    return pickEach(g, picks, 'item-wait')
  }
  const g0 = toProbe({ 0: 'display', 1: 'trash' })
  assert.match(view(g0, 'p1').result!.mine!.text, /의미를 읽어 낼 수 없었다/)
  const g = settle(soloAs(soloAs(settle(g0), 'p2', 'trash-1-good'), 'p2', 'trash-2-good')) // 휴지통 종이는 단계형 조사다
  assert.ok(!g.run.players[0].facts.some((f) => f.startsWith('yday-')), '표시등에서는 단서가 나오지 않는다')
  assert.ok(g.run.players[1].facts.includes('yday-coin'), '휴지통의 종이에서도 어제의 거래가 나온다')
  console.log('통과: 자판기 조사 — 알아낼 것이 없는 곳과 같은 단서에 이르는 다른 길')
}

// 15) 아이템: 낮의 조사에서만 얻고, 밤에는 쓰는 선택지만 있다 (버튼의 장갑·거스름돈의 집게)
{
  const toNight = (order: string, task: 'button' | 'change', wrong: string, dayPicks: Record<number, string>) => {
    const r: Run = { ...RUN, order }
    let g = start(2, r)
    for (const node of ['arrive', 'first-look', `${task}-intro`]) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
    g = settle(pickEach(g, dayPicks, `${task}-wait`))
    g = settle(voteAll(g, wrong))
    assert.equal(g.run.nodeId, `${task}-night`)
    return g
  }
  // 버튼: 정비 서랍에서 장갑을 얻고, 밤에 장갑을 끼고 초록 선을 확인한다 (둘째 과제로 두고 첫 과제를 건너뛰려면 순서만 정하면 된다)
  const b = toNight('button>item>change', 'button', 'button-pass', { 0: 'toolbox' })
  assert.deepEqual(b.run.players.map((p) => p.items.includes('glove')), [true, false], '낮의 조사로 장갑을 얻었다')
  assert.deepEqual(choiceIds(b).filter((x) => x === 'drawer'), [], '밤에는 아이템을 얻는 선택지가 없다')
  assert.ok(choiceIds(b, 'p1').some((x) => x.startsWith('glove-night-')) && !choiceIds(b, 'p2').some((x) => x.startsWith('glove-night-')), '장갑을 쓰는 선택지는 가진 사람에게만 보인다')
  const bn = settle(pickEach(b, { 0: choiceIds(b, 'p1').find((x) => x.startsWith('glove-night-'))! }, 'coffee'))
  assert.ok(bn.run.players[0].facts.includes('green-at-A'), '밤에 장갑으로 초록 선의 끝을 알아낸다')
  // 거스름돈: 공구함에서 집게를 얻고, 밤에 집게로 장부를 지켜본다
  const c = toNight('change>item>button', 'change', 'change-pass', { 1: 'toolbox' })
  assert.deepEqual(c.run.players.map((p) => p.items.includes('tongs')), [false, true], '낮의 조사로 집게를 얻었다')
  assert.ok(choiceIds(c, 'p2').includes('tongs-night') && !choiceIds(c, 'p1').includes('tongs-night'))
  const cn = settle(pickEach(c, { 1: 'tongs-night' }, 'coffee'))
  assert.ok(cn.run.players[1].facts.includes('change-moved'))
  console.log('통과: 아이템은 낮의 조사에서만 얻고 밤에는 쓰기만 한다 (장갑·집게)')
}

// 16) 단계형 조사(낙서 읽기): 고른 사람만 혼자 단계를 진행하고, 어떻게 고르느냐에 따라 얻는 단서가 달라지며, 결과는 모두 끝난 뒤에 나온다
{
  const r: Run = { ...RUN, order: 'item>button>change' }
  const toProbe = () => {
    let g = start(2, r)
    for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
    return g
  }
  const factsOf = (g: ScenarioGame, i: number) => g.run.players[i].facts

  // 단계형 조사를 고르면 도입을 읽은 뒤 파고들기로 간다. 고른 사람은 고르는 화면 없이 바로 첫 단계에 서고, 나머지는 기다린다.
  let g = settle(pickEach(toProbe(), { 0: 'graffiti', 1: 'display' }, 'item-wait'))
  assert.equal(g.run.nodeId, 'item-dig')
  assert.equal(g.run.phase, 'personal')
  assert.deepEqual(view(g, 'p1').scene!.solo!.choices.map((c) => c.id), ['graffiti-1-date', 'graffiti-1-big'])
  assert.equal(view(g, 'p2').scene!.solo, null, '조사하지 않은 사람에게는 단계가 없다')
  assert.equal(view(g, 'p2').scene!.mineDone, true)
  assert.ok(!factsOf(g, 0).includes('item-cycle'), '단계를 끝내기 전에는 단서가 없다')
  // 가장 좋은 길: 날짜 줄 → 방향을 따라간다 → 온전한 단서
  const best = digThrough(g, 'p1', 'graffiti-1-date', 'graffiti-2a-order')
  assert.equal(best.run.nodeId, 'item-think')
  assert.ok(factsOf(best, 0).includes('item-cycle') && !factsOf(best, 0).includes('item-cycle-half'))
  assert.equal(best.run.lastSplit, undefined, '조사의 선택은 파고들기가 끝나면 남지 않는다')
  // 날짜 줄 → 줄을 센다: 흐릿한 단서뿐
  const half = digThrough(g, 'p1', 'graffiti-1-date', 'graffiti-2a-count')
  assert.ok(factsOf(half, 0).includes('item-cycle-half') && !factsOf(half, 0).includes('item-cycle'))
  // 큰 글씨부터: 아래쪽을 읽으면 흐릿한 단서, 물러서면 아무것도 못 얻고 정신력만 잃는다
  assert.ok(factsOf(digThrough(g, 'p1', 'graffiti-1-big', 'graffiti-2b-low'), 0).includes('item-cycle-half'))
  const s0 = g.run.players[0].stats.sanity
  const none = digThrough(g, 'p1', 'graffiti-1-big', 'graffiti-2b-leave')
  assert.ok(!factsOf(none, 0).some((f) => f.startsWith('item-cycle')), '잘못 읽고 물러서면 단서가 없다')
  assert.equal(none.run.players[0].stats.sanity, s0 - 1)
  // 결과는 모두 끝난 뒤에 나온다: 파고들기 도중에는 결과 화면이 아니다
  const mid = soloAs(g, 'p1', 'graffiti-1-date')
  assert.equal(mid.run.phase, 'personal')
  assert.equal(view(mid, 'p1').scene!.solo!.choices.length, 2)
  const done = soloAs(mid, 'p1', 'graffiti-2a-order')
  assert.equal(done.run.phase, 'result', '모두 끝나야 결과가 나온다')
  assert.match(view(done, 'p1').result!.mine!.text, /가벼운 것에서 소중한 것으로/)
  // 조사하지 않은 사람에게는 "할 수 있는 일이 없었다"가 뜨지 않는다
  assert.doesNotMatch(view(done, 'p2').result!.mine?.text ?? '', /할 수 있는 일이 없었다/)

  // 단계형 조사를 아무도 고르지 않으면 파고들기 없이 바로 추리다
  assert.equal(settle(pickEach(toProbe(), { 0: 'display' }, 'item-wait')).run.nodeId, 'item-think')

  // 부분 단서도 추리 근거가 된다: 첫 단계(규칙)의 근거 이야기가 달라진다
  const reasoned = voteAll(voteAll(half, 'item-reason'), 'rule-cycle')
  assert.match(view(reasoned).scene!.text, /같은 순서로 되풀이되는 것을 읽은 것이 근거였다/)
  console.log('통과: 단계형 조사 (혼자 단계 진행·고르는 방식에 따라 다른 단서·모두 끝난 뒤 결과)')
}

// 17) 단계형 조사(자판기): 장부 읽기(3단계 조사)·플래시 비추기·집게로 집기 — 맞게 두 번 고르면 단서가 나오고, 어긋나면 얻지 못하고 정신력만 잃는다
{
  const toTask = (order: string, task: 'item' | 'change', mutate: (g: ScenarioGame) => void) => {
    let g = start(2, { ...RUN, order })
    for (const node of ['arrive', 'first-look', `${task}-intro`]) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
    g = structuredClone(g)
    mutate(g)
    return g
  }
  const solo = (g: ScenarioGame, ...choices: string[]) => choices.reduce((s, c) => (c === 'ready' ? act(s, { type: 'ready', playerId: 'p1' }) : soloAs(s, 'p1', c)), g)
  const open3 = (g: ScenarioGame) => g.run.flags.push('pass-item-1', 'pass-item-2') // 오답·패스 두 번 → 3단계 조사가 열린다

  // 장부 읽기(3단계, 오늘 받는 것마다 다른 단서): 오늘 줄을 찾고 작은 글씨를 읽으면 그 판의 단서가 나온다
  for (const price of ITEMS) {
    const r: Run = { ...RUN, order: 'item>button>change', price }
    let g = start(2, r)
    for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
    g = structuredClone(g)
    open3(g)
    g = settle(pickEach(g, { 0: 'ledger' }, 'item-wait'))
    assert.equal(g.run.nodeId, 'item-dig')
    g = solo(g, 'ledger-1-good')
    assert.equal(view(g, 'p1').scene!.solo!.choices.length, 2, '맞는 선택지는 판마다 하나만 보인다')
    g = settle(solo(g, `ledger-2-good-${ITEMS.indexOf(price)}`))
    assert.ok(g.run.players[0].facts.includes(`ledger-${price}`), `${price}: 장부의 단서`)
  }

  // 어긋나게 고르면 단서가 없고 정신력만 잃는다 (첫 단계에서 어긋나면 거기서 끝난다)
  let bad = toTask('item>button>change', 'item', open3)
  const s0 = bad.run.players[0].stats.sanity
  bad = settle(solo(settle(pickEach(bad, { 0: 'ledger' }, 'item-wait')), 'ledger-1-bad', 'ready'))
  assert.equal(bad.run.nodeId, 'item-think')
  assert.ok(!bad.run.players[0].facts.some((f) => f.startsWith('ledger-')))
  assert.equal(bad.run.players[0].stats.sanity, s0 - 1)

  // 집게로 집기(아이템 조사, 단서는 판마다 같다)
  const withTongs = toTask('change>item>button', 'change', (g) => void g.run.players[0].items.push('tongs'))
  const t = settle(solo(settle(pickEach(withTongs, { 0: 'tongs' }, 'change-wait')), 'tongs-1-good', 'tongs-2-good-0'))
  assert.equal(t.run.nodeId, 'change-think')
  assert.ok(t.run.players[0].facts.includes('change-moved'))
  console.log('통과: 단계형 조사(자판기) — 장부·플래시·집게')
}
