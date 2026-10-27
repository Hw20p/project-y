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

/** 의도한 답의 선택지 id */
const rightAnswer = (task: (typeof TASKS)[number], r: Run) =>
  task === 'item' ? `item-${r.price}` : task === 'button' ? `btn-${r.button}` : 'leave'

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
    else if (task) g = ready(g) // 소개·풀렸다
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
  assert.deepEqual(choiceIds(solo), ['graffiti', 'receipt', 'item-wait'], '처음에는 1단계 조사만')
  solo = settle(pickEach(solo, {}, 'graffiti'))
  assert.equal(solo.run.nodeId, 'item-think')
  solo = settle(voteAll(solo, 'item-pass'))
  assert.equal(solo.run.time, 1)
  assert.equal(solo.run.nodeId, 'item-night', '패스하면 밤이 온다')
  solo = settle(pickEach(solo, {}, 'coffee'))
  assert.deepEqual(choiceIds(solo), ['receipt', 'slot', 'tray-solo', 'item-wait'], '혼자: 둘이 하는 조사 대신 혼자 쓰는 조사')
  let duo = toProbe(2, 'item')
  duo = settle(pickEach(settle(voteAll(pickEach(duo, {}, 'item-wait'), 'item-pass')), {}, 'coffee'))
  assert.deepEqual(choiceIds(duo), ['graffiti', 'receipt', 'slot', 'tray-pair', 'item-wait'], '둘: 함께하는 조사가 열리고 혼자 쓰는 조사는 없다')
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
  assert.equal(view(g).light, null, '자판기의 시계는 조명이 아니다')
  const sanity = g.run.players[0].stats.sanity
  const wrong = voteAll(g, 'item-badge')
  assert.equal(wrong.run.time, 1)
  assert.equal(view(wrong).clockLabel, '새벽 한 시')
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
  c = voteAll(c, 'item-badge')
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
  g = pickEach(g, { 0: 'notice', 1: 'ear' }, 'button-wait')
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

// 11) 오답 뒤의 밤: 과제의 단서·아이템 선택지가 나오고(이미 아는 단서는 숨는다), 아이템은 얻은 사람의 조사를 열어 준다.
//     과제를 푼 뒤의 휴식에는 스텟 선택지뿐이다.
{
  const r: Run = { ...RUN, order: 'item>button>change' } // 오늘 받는 것은 낡은 동전, 어제는 사원증
  let g = start(2, r)
  for (const node of ['arrive', 'first-look', 'item-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'pocket')) : ready(g)
  g = voteAll(pickEach(g, {}, 'item-wait'), 'item-badge') // 사원증이라고 걸었다가 틀렸다
  g = settle(g)
  assert.equal(g.run.nodeId, 'item-night')
  // 어제 받은 것(사원증)이 아니라는 것은 오답으로 이미 밝혀졌으므로 "투입구 소리" 선택지는 숨는다
  assert.deepEqual(choiceIds(g), ['dates-coin', 'drawer', 'coffee', 'study'])
  g = settle(pickEach(g, { 0: 'dates-coin', 1: 'drawer' }, 'coffee'))
  assert.equal(g.run.nodeId, 'item-probe')
  assert.deepEqual(view(g, 'p2').clues.filter((c) => c.id === 'night-last-coin').map((c) => c.by.map((b) => b.id)), [['p1']])
  assert.ok(choiceIds(g, 'p2').includes('lit') && !choiceIds(g, 'p1').includes('lit'), '플래시를 가진 사람에게만 열린다')
  const lit = settle(pickEach(g, { 1: 'lit' }, 'item-wait'))
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
  assert.ok(g.run.players[0].facts.includes('yday-coin'))
  assert.match(view(g, 'p1').result!.mine!.text, /글자가 잉크처럼 번져/)

  // 거스름돈: 위험한 곳은 정신력 −3 (낙서를 읽은 사람만)
  let c = start(2, { ...RUN, order: 'change>item>button' }, { 'risk-change': 'wall' })
  for (const node of ['arrive', 'first-look', 'change-intro']) c = node === 'first-look' ? settle(pickEach(c, {}, 'pocket')) : ready(c)
  const s0 = c.run.players.map((p) => p.stats.sanity)
  c = pickEach(c, { 0: 'wall', 1: 'tray-paper' }, 'change-wait')
  assert.equal(c.run.players[0].stats.sanity, s0[0] - 3)
  assert.equal(c.run.players[1].stats.sanity, s0[1])

  // 거스름돈의 답에 "막는다"가 더해졌고, 틀린 답이며 모두가 알게 된다
  const cover = voteAll(settle(c), 'cover')
  assert.ok(cover.run.players.every((p) => p.facts.includes('change-no-cover')))
  console.log('통과: 위험한 곳(자판기)과 거스름돈의 새 오답')
}
