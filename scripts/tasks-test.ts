// 과제 빌더(src/scenario/tasks.ts) 시험: 과제 순서, 3단계 조사, 오답·패스의 대가, 조명(마감), 끝이 나는지.
import assert from 'node:assert/strict'
import { exploreScenario } from '../src/scenario/explore.ts'
import { chainLockDef, tasksChain, tasksDemo as sc, tasksSmall } from '../src/scenario/fixtures/tasks.ts'
import { buildTasks } from '../src/scenario/tasks.ts'
import { createScenarioGame, reduceScenario, type ScenarioAction } from '../src/scenario/game.ts'
import { partyOf } from '../src/scenario/registry.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import { validateScenario } from '../src/scenario/validate.ts'
import { needMoreChoiceIds, viewForScenario } from '../src/scenario/view.ts'

const ORDERS = [
  'lock>lamp>door',
  'lock>door>lamp',
  'lamp>lock>door',
  'lamp>door>lock',
  'door>lock>lamp',
  'door>lamp>lock',
]
const ANSWERS = { lock: '1', lamp: '2', door: '3' } as const

const start = (n = 2, order = ORDERS[0]): ScenarioGame =>
  createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { order, ...ANSWERS } })
const act = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(sc, g, a)
const ids = (g: ScenarioGame) => g.run.players.map((p) => p.id)
const readyAll = (g: ScenarioGame) => ids(g).reduce((s, id) => act(s, { type: 'ready', playerId: id }), g)
const voteAll = (g: ScenarioGame, choiceId: string) => ids(g).reduce((s, id) => act(s, { type: 'vote', playerId: id, choiceId }), g)
const pickAll = (g: ScenarioGame, actionId: string) => ids(g).reduce((s, id) => act(s, { type: 'pick', playerId: id, actionId }), g)
const view = (g: ScenarioGame, id = 'p1') => viewForScenario(sc, g, id)
const choiceIds = (g: ScenarioGame, id = 'p1') => view(g, id).scene!.choices.map((c) => c.id)

/** 장면 `nodeId`에 닿을 때까지 읽고 계속한다 (조사에서는 모두 기다리고, 추리에서는 걸지 않고 패스하지 않는다 — 이야기 장면만 넘긴다) */
function readTo(g: ScenarioGame, nodeId: string): ScenarioGame {
  for (let i = 0; i < 20 && g.run.nodeId !== nodeId; i++) {
    assert.ok(g.run.phase === 'story' || g.run.phase === 'result', `${g.run.nodeId}는 읽는 장면이어야 한다`)
    g = readyAll(g)
  }
  assert.equal(g.run.nodeId, nodeId)
  return g
}

/** 과제 하나를 정답으로 푼다: 소개 → 조사(모두 기다림) → 추리(정답) → 풀렸다 */
function solve(g: ScenarioGame, task: keyof typeof ANSWERS): ScenarioGame {
  g = readTo(g, `${task}-intro`)
  g = readyAll(g)
  assert.equal(g.run.nodeId, `${task}-probe`)
  g = pickAll(g, `${task}-wait`)
  assert.equal(g.run.nodeId, `${task}-think`)
  g = voteAll(g, `n${ANSWERS[task]}`)
  assert.equal(g.run.nodeId, `${task}-right`)
  return g
}

// 1) 정적 검증
{
  const r = validateScenario(sc)
  assert.deepEqual(r.errors, [])
  console.log('통과: 과제 시나리오 정적 검증')
}

// 2) 어떤 순서가 뽑혀도 그 순서대로 과제가 이어지고, 모두 풀면 마지막 선택이 열린다
for (const order of ORDERS) {
  let g = start(2, order)
  const tasks = order.split('>') as (keyof typeof ANSWERS)[]
  for (const t of tasks) g = solve(g, t)
  g = readTo(g, 'finale')
  assert.deepEqual(
    g.run.visited.filter((n) => n.endsWith('-intro')),
    tasks.map((t) => `${t}-intro`),
    `${order}: 과제 순서`,
  )
  assert.equal(g.run.time, 0, '풀기만 하면 조명은 그대로다')
  g = voteAll(g, 'open')
  assert.equal(g.run.endingId, 'win')
}
console.log('통과: 과제 순서 6가지 (무작위 순서대로 풀리고 마지막 선택이 열린다)')

// 3) 오답: 조명과 정신력이 깎이고, 그 답이 지워지고, 새 조사 선택지가 열린다 (처음으로 돌아가지 않는다)
{
  let g = start()
  g = readyAll(readTo(g, 'lock-intro'))
  assert.deepEqual(choiceIds(g), ['look', 'touch', 'lock-wait'], '처음에는 1단계 조사만 있다')
  g = pickAll(g, 'lock-wait')
  assert.deepEqual(choiceIds(g), ['n1', 'n2', 'n3', 'lock-pass'])
  const sanity = g.run.players[0].stats.sanity

  g = voteAll(g, 'n2') // 오답
  assert.equal(g.run.nodeId, 'lock-wrong-n2')
  assert.equal(g.run.time, 1, '조명이 한 단계 어두워졌다')
  for (const p of g.run.players) assert.equal(p.stats.sanity, sanity - 2, '정신력이 깎였다')
  assert.ok(view(g).scene!.text.includes('새로 살필 수 있는 곳이 생겼다'))
  assert.ok(g.run.players.every((p) => p.facts.includes('no-lock-2')), '오답이었음을 모두가 안다')

  g = readyAll(g)
  assert.equal(g.run.nodeId, 'lock-probe', '처음으로 돌아가지 않고 조사로 돌아온다')
  assert.deepEqual(choiceIds(g), ['look', 'touch', 'listen', 'lock-wait'], '2단계 선택지가 새로 열렸다')

  // 살핀 곳은 다시 살필 수 없다
  g = act(act(g, { type: 'pick', playerId: 'p1', actionId: 'look' }), { type: 'pick', playerId: 'p2', actionId: 'lock-wait' })
  assert.equal(g.run.phase, 'result')
  assert.ok(view(g, 'p1').result!.mine!.text.includes('눈으로 보니'), '살핀 사람에게 발견이 보인다')
  g = readTo(g, 'lock-think')
  g = readTo(voteAll(g, 'lock-pass'), 'lock-probe') // 한 번 더 넘기면 두 번째 단계 상승
  assert.deepEqual(choiceIds(g), ['touch', 'listen', 'note', 'lock-wait'], 'look은 이미 살펴서 사라지고 3단계가 열렸다')
  console.log('통과: 오답 (조명·정신력·지워짐·새 조사 선택지·살핀 곳은 다시 못 살핌)')
}

// 4) 추리 장면에서는 틀린 답이 지워진다
{
  let g = start()
  g = pickAll(readyAll(readTo(g, 'lock-intro')), 'lock-wait')
  g = readyAll(voteAll(g, 'n2'))
  g = pickAll(g, 'lock-wait')
  assert.deepEqual(choiceIds(g), ['n1', 'n3', 'lock-pass'], '틀린 n2는 지워졌다')
  console.log('통과: 틀린 답은 추리 선택지에서 지워진다')
}

// 5) 패스: 조명만 깎이고, 두 번째 패스로 3단계까지 열린다. 세 번째 패스도 조명을 깎는다
{
  let g = start()
  g = pickAll(readyAll(readTo(g, 'lock-intro')), 'lock-wait')
  const sanity = g.run.players[0].stats.sanity
  g = voteAll(g, 'lock-pass')
  assert.equal(g.run.nodeId, 'lock-pass-1')
  assert.equal(g.run.time, 1)
  for (const p of g.run.players) assert.equal(p.stats.sanity, sanity, '패스는 정신력을 깎지 않는다')
  g = readyAll(g)
  assert.ok(choiceIds(g).includes('listen') && !choiceIds(g).includes('note'))

  g = pickAll(g, 'lock-wait')
  g = voteAll(g, 'lock-pass')
  assert.equal(g.run.nodeId, 'lock-pass-2')
  assert.equal(g.run.time, 2)
  g = readyAll(g)
  assert.ok(choiceIds(g).includes('note'), '두 번 넘기면 3단계가 열린다')

  g = pickAll(g, 'lock-wait')
  g = voteAll(g, 'lock-pass')
  assert.equal(g.run.nodeId, 'lock-pass-2', '세 번째 패스는 단계를 더 올리지 않는다')
  assert.equal(g.run.time, 3)
  console.log('통과: 패스 (조명만 깎임·3단계까지)')
}

// 6) 오답 하나 + 패스 하나로도 3단계가 열린다 (둘을 합쳐 센다)
{
  let g = start()
  g = pickAll(readyAll(readTo(g, 'lock-intro')), 'lock-wait')
  g = readyAll(voteAll(g, 'n3'))
  g = pickAll(g, 'lock-wait')
  g = readyAll(voteAll(g, 'lock-pass'))
  assert.ok(choiceIds(g).includes('note'))
  console.log('통과: 오답과 패스를 합쳐 단계가 오른다')
}

// 7) 3단계 쪽지는 정답을 알려 준다 (판마다 다른 값에 맞게)
{
  let g = start()
  g = pickAll(readyAll(readTo(g, 'lock-intro')), 'lock-wait')
  g = readyAll(voteAll(g, 'lock-pass'))
  g = pickAll(g, 'lock-wait')
  g = readyAll(voteAll(g, 'lock-pass'))
  g = act(act(g, { type: 'pick', playerId: 'p1', actionId: 'note' }), { type: 'pick', playerId: 'p2', actionId: 'lock-wait' })
  assert.ok(view(g, 'p1').result!.mine!.text.includes(`${ANSWERS.lock}번`), '쪽지에 이번 판의 정답이 적혀 있다')
  assert.equal(view(g, 'p2').result!.mine, null, '다른 사람의 발견은 지금은 안 보인다')
  console.log('통과: 3단계 조사는 답을 알려 준다')
}

// 8) 조명이 끝까지 어두워지면 암전 (패스를 계속하면 마감 엔딩)
{
  let g = start()
  g = pickAll(readyAll(readTo(g, 'lock-intro')), 'lock-wait')
  for (let i = 0; i < 20 && g.run.phase !== 'ended'; i++) {
    if (g.run.nodeId === 'lock-think') g = voteAll(g, 'lock-pass')
    else if (g.run.nodeId === 'lock-probe') g = pickAll(g, 'lock-wait')
    else g = readyAll(g)
  }
  assert.equal(g.run.endingId, 'dark')
  assert.equal(g.run.time, 6)
  console.log('통과: 조명이 꺼지면 암전')
}

// 9) 틀린 답을 계속 고르면 언젠가 정답만 남거나 암전·정신 상실로 끝난다 (끝이 있다)
for (const n of [1, 2, 3]) {
  let g = start(n)
  for (let i = 0; i < 60 && g.run.phase !== 'ended'; i++) {
    if (g.run.phase === 'vote') {
      const open = choiceIds(g).filter((c) => !c.endsWith('-pass'))
      g = voteAll(g, open[0])
    } else if (g.run.phase === 'split') g = pickAll(g, `${g.run.nodeId.split('-')[0]}-wait`)
    else g = readyAll(g)
  }
  assert.equal(g.run.phase, 'ended', `${n}명: 끝이 난다`)
}
console.log('통과: 아무렇게나 골라도 끝이 난다 (1·2·3명)')

// 10) 보드: 풀린 과제만 풀린 것으로 보인다
{
  let g = start()
  g = readTo(solve(g, 'lock'), 'lamp-intro')
  const solved = view(g).board!.questions.filter((q) => q.solved).map((q) => q.id)
  assert.deepEqual(solved, ['lock'])
  console.log('통과: 조사 보드의 풀린 의문')

  // 4단계: 시작하기 전에는 아무 의문도 안 보이고, 과제를 시작하면 그 의문이 "지금 과제"로 보인다. 아직 안 한 과제는 숨는다.
  const before = view(start()).board!.questions
  assert.ok(before.every((q) => q.text === null && !q.current), '시작 전에는 의문이 안 보인다')
  const now = view(g).board!.questions
  assert.deepEqual(now.filter((q) => q.current).map((q) => q.id), ['lamp'], '지금 과제만 강조된다')
  assert.deepEqual(now.map((q) => q.text !== null), [true, true, false], '풀린 과제와 지금 과제는 보이고 아직 안 한 과제는 숨는다')

  // 조명: 시계가 조명이라 마감까지의 단계가 보이고, 이름은 상태를 말로 적는다
  assert.deepEqual(view(g).light, { max: 6, level: 0 })
  assert.equal(view(g).clockLabel, '조명이 환하다')
  let miss = pickAll(readyAll(readTo(start(), 'lock-intro')), 'lock-wait')
  miss = voteAll(miss, 'lock-pass')
  assert.equal(view(miss).clockLabel, '조명이 깜빡인다', '패스하면 조명이 한 단계 어두워진다')
  console.log('통과: 지금 과제 강조와 조명 표시')
}

// 12) 2인 선택지(min): 둘이 함께 골라야 열리고, 모자라면 진행하지 않으며, 강제 진행하면 한 것으로 치지 않는다
// (T-04 자물쇠의 1단계 조사 "둘이서 함께 살핀다"가 2인 선택지다. 전수 탐색은 아래 11번이 함께 본다.)
{
  const scMin = tasksSmall
  assert.deepEqual(validateScenario(scMin).errors, [], '2인 선택지가 있는 시나리오도 정적 검증을 통과한다')
  const A = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(scMin, g, a)
  const V = (g: ScenarioGame, id = 'p1') => viewForScenario(scMin, g, id)
  const probeOf = (n: number): ScenarioGame => {
    let g = createScenarioGame(scMin, { seed: 1, players: partyOf(n), vars: { order: 'lock>door', lock: '1', door: '3' } })
    for (const node of ['begin', 'lock-intro']) {
      assert.equal(g.run.nodeId, node)
      for (const p of g.run.players) g = A(g, { type: 'ready', playerId: p.id })
    }
    assert.equal(g.run.nodeId, 'lock-probe')
    return g
  }
  const pick = (g: ScenarioGame, playerId: string, actionId: string) => A(g, { type: 'pick', playerId, actionId })

  let g = probeOf(2)
  const pair = V(g).scene!.choices.find((c) => c.id === 'pair')
  assert.equal(pair?.min, 2, '필요 인원이 화면에 나온다')

  // 한 명만 고르면 모두 골랐어도 진행하지 않는다
  g = pick(pick(g, 'p1', 'pair'), 'p2', 'lock-wait')
  assert.equal(g.run.phase, 'split', '인원이 모자라서 진행하지 않는다')
  assert.deepEqual(needMoreChoiceIds(V(g).scene), ['pair'])
  const short = g

  // 다른 한 명이 함께하면 진행되고, 둘 다 발견을 본다
  const joined = pick(g, 'p2', 'pair')
  assert.equal(joined.run.phase, 'result')
  assert.ok(V(joined, 'p1').result!.mine!.text.includes('둘이서 함께 살피니'))
  assert.ok(V(joined, 'p2').result!.mine!.text.includes('둘이서 함께 살피니'))

  // 정원은 둘이라 셋째는 함께할 수 없다
  const three = pick(pick(probeOf(3), 'p1', 'pair'), 'p2', 'pair')
  assert.equal(V(three, 'p3').scene!.choices.find((c) => c.id === 'pair')!.full, true)

  // 강제 진행: 인원이 모자란 행동은 한 것으로 치지 않는다
  // (얻은 것이 없으니 결과 화면 없이 바로 추리로 넘어간다)
  const forced = A(short, { type: 'force' })
  assert.equal(forced.run.nodeId, 'lock-think')
  assert.deepEqual(forced.run.players[0].facts, [], '혼자 고른 사람은 아무것도 얻지 못했다')
  assert.equal(forced.run.flags.includes('seen-lock-pair'), false, '살핀 곳으로 기록되지도 않는다')

  // 고른 것을 거두고 다른 행동으로 바꾸면 진행된다
  const swapped = pick(A(short, { type: 'cancel', playerId: 'p1' }), 'p1', 'lock-wait')
  assert.equal(swapped.run.nodeId, 'lock-think')

  // 혼자(할 수 있는 사람이 모자람)이거나, 함께할 사람이 정신을 잃었으면 선택지가 보이지 않는다
  assert.equal(V(probeOf(1)).scene!.choices.some((c) => c.id === 'pair'), false, '혼자일 때는 보이지 않는다')
  const panicked = probeOf(2)
  panicked.run.players[1].stats.sanity = 0
  assert.equal(V(panicked).scene!.choices.some((c) => c.id === 'pair'), false, '함께할 사람이 정신을 잃었으면 보이지 않는다')
  console.log('통과: 2인 선택지 (모자라면 진행 안 함·함께하면 둘 다 발견·강제 진행은 무효·혼자일 때 숨김)')
}

// 11) 전수 탐색(과제 둘, 조사 단계마다 하나로 줄인 작은 것): 모든 엔딩에 닿고, 갇히거나 멈추는 곳이 없다
for (const n of [1, 2]) {
  const r = exploreScenario(tasksSmall, {
    players: partyOf(n),
    maxStates: 300000,
    combos: [
      { order: 'lock>door', lock: '1', door: '2' },
      { order: 'door>lock', lock: '3', door: '1' },
    ],
  })
  const reach = Object.fromEntries(r.endings.map((e) => [e.id, e.reachableCombos]))
  assert.deepEqual(r.stuck, [], `${n}명: 멈추는 곳이 없다`)
  if (r.truncated) {
    // 상태가 한도를 넘어 일부만 본 경우: "닿을 수 없다"는 확정이 아니므로 엔딩 도달은 확인하지 않는다
    console.log(`주의: 전수 탐색 ${n}명이 한도(상태 ${r.states}개)에 걸려 엔딩 도달 확인을 건너뛰었다 ${JSON.stringify(reach)}`)
    continue
  }
  assert.deepEqual(r.deadEnds, [], `${n}명: 갇히는 곳이 없다`)
  assert.ok(reach.win > 0 && reach.quiet > 0 && reach.dark > 0 && reach.collapse > 0, `${n}명: 모든 엔딩에 닿는다 ${JSON.stringify(reach)}`)
  assert.deepEqual(r.unvisitedNodes, [], `${n}명: 지나가지 못한 장면 없음`)
  // 2인 선택지: 혼자일 때는 보이지 않아 못 고르는 것이 맞고, 둘 이상이면 고르는 길이 있어야 한다
  assert.equal(r.untakenChoices.includes('lock-probe.pair'), n === 1, `${n}명: 2인 선택지를 ${n === 1 ? '못 고른다' : '고르는 길이 있다'}`)
  console.log(`통과: 전수 탐색 ${n}명 (상태 ${r.states}개, 엔딩 ${JSON.stringify(reach)}, 못 고른 선택지 ${r.untakenChoices.length}개)`)
}

// 12) 추리 사슬: 빌더가 작성 실수를 잡고, 단계마다 투표하며, 틀리면 그 시도가 끝나고, 끝까지 맞으면 풀린다
{
  const def = chainLockDef()
  assert.throws(() => buildTasks({ tasks: [{ ...def, chain: def.chain!.slice(0, 2) }], after: 'x' }), /3단계 이상/)
  assert.throws(() => buildTasks({ tasks: [{ ...def, answers: [{ id: 'a', text: 'a', right: true }] }], after: 'x' }), /함께 쓸 수 없다/)
  assert.throws(() => buildTasks({ tasks: [{ ...def, chain: [{ ...def.chain![0], ok: undefined }, ...def.chain!.slice(1)] }], after: 'x' }), /근거를 보이는 이야기\(ok\)/)
  const rpt = validateScenario(tasksChain)
  assert.deepEqual(rpt.errors, [], rpt.errors.join('\n'))
  assert.deepEqual(rpt.warnings, [], rpt.warnings.join('\n'))

  const cs = (a: ScenarioGame, x: ScenarioAction) => reduceScenario(tasksChain, a, x)
  const cids = (g: ScenarioGame) => g.run.players.map((p) => p.id)
  const cready = (g: ScenarioGame) => cids(g).reduce((s, id) => cs(s, { type: 'ready', playerId: id }), g)
  const cvote = (g: ScenarioGame, choiceId: string) => cids(g).reduce((s, id) => cs(s, { type: 'vote', playerId: id, choiceId }), g)
  const cview = (g: ScenarioGame) => viewForScenario(tasksChain, g, 'p1')
  const atThink = (lock: string) => {
    let g = createScenarioGame(tasksChain, { seed: 1, players: partyOf(2), vars: { order: 'lock', lock } })
    g = cready(g) // begin
    g = cready(g) // lock-intro
    return cids(g).reduce((s, id) => cs(s, { type: 'pick', playerId: id, actionId: 'lock-wait' }), g)
  }

  // 추리 장면에는 "시작"과 "더 조사"뿐이다
  const think = atThink('2')
  assert.equal(think.run.nodeId, 'lock-think')
  assert.deepEqual(cview(think).scene!.choices.map((c) => c.id), ['lock-reason', 'lock-pass'])

  // 끝까지 맞으면 풀린다 (번호가 2번인 판: 크지 않다 → 2번이다 → 2번)
  let g = cvote(think, 'lock-reason')
  assert.equal(g.run.nodeId, 'lock-c1')
  assert.deepEqual(cview(g).scene!.choices.map((c) => c.id), ['big', 'small'])
  g = cready(cvote(g, 'small'))
  assert.equal(g.run.nodeId, 'lock-c2')
  g = cready(cvote(g, 'two'))
  assert.equal(g.run.nodeId, 'lock-c3')
  g = cvote(g, 'n2')
  assert.equal(g.run.nodeId, 'lock-right')
  assert.equal(g.run.time, 0)
  assert.equal(cready(g).run.nodeId, 'finale')

  // 번호가 3번인 판은 같은 단계에서 다른 보기가 맞는다
  let h = cvote(atThink('3'), 'lock-reason')
  assert.equal(cvote(h, 'big').run.nodeId, 'lock-c1-ok')
  assert.equal(cvote(h, 'small').run.nodeId, 'lock-c1-wrong-small-1')

  // 틀리면 그 시도가 거기서 끝난다: 오답의 대가를 치르고 조사로 돌아간다. 첫 번째와 두 번째 이후는 다른 장면이다.
  const sanity = think.run.players[0].stats.sanity
  let w = cvote(cready(cvote(cvote(think, 'lock-reason'), 'small')), 'not-two') // 둘째 단계에서 틀렸다
  assert.equal(w.run.nodeId, 'lock-c2-wrong-not-two-1')
  assert.equal(w.run.time, 1)
  for (const p of w.run.players) assert.equal(p.stats.sanity, sanity - 2)
  w = cready(w)
  assert.equal(w.run.nodeId, 'lock-probe')
  assert.ok(cview(w).scene!.choices.some((c) => c.id === 'listen'), '한 번 틀리면 2단계 조사가 열린다')
  w = cids(w).reduce((s, id) => cs(s, { type: 'pick', playerId: id, actionId: 'lock-wait' }), w)
  w = cvote(cready(cvote(cvote(w, 'lock-reason'), 'small')), 'not-two')
  assert.equal(w.run.nodeId, 'lock-c2-wrong-not-two-2')
  // 마지막 단계의 오답은 그 번호가 아니라고 모두가 알게 된다
  const last = cvote(cready(cvote(cready(cvote(cvote(think, 'lock-reason'), 'small')), 'two')), 'n1')
  assert.equal(last.run.nodeId, 'lock-c3-wrong-n1-1')
  assert.ok(last.run.players.every((p) => p.facts.includes('no-lock-1')))

  // 전수 탐색: 멈추는 곳도 갇히는 곳도 없다
  const r = exploreScenario(tasksChain, {
    players: partyOf(1),
    maxStates: 300000,
    combos: [
      { order: 'lock', lock: '2' },
      { order: 'lock', lock: '3' },
    ],
  })
  assert.deepEqual(r.stuck, [])
  if (!r.truncated) {
    assert.deepEqual(r.deadEnds, [])
    assert.ok(r.endings.find((e) => e.id === 'win')!.reachableCombos > 0, '추리 사슬로 풀어 엔딩에 닿는다')
  }
  console.log(`통과: 추리 사슬 (빌더 검증·단계 투표·틀리면 그 시도 종료·전수 탐색 상태 ${r.states}개)`)
}
