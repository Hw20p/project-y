// B7 로비 공략 시험: 의도한 풀이가 모든 판(무작위 값 9가지 × 2~4명)에서 진엔딩에 닿는지, 흔한 실수가 의도한 결말로 이어지는지.
// (전수 탐색은 `npm run explore -- b7-lobby 2`로 따로 돌린다. 이 시험은 몇 초 안에 끝난다.)
import assert from 'node:assert/strict'
import { b7Lobby as sc } from '../src/content/scenarios/b7-lobby.ts'
import { createScenarioGame, reduceScenario, type ScenarioAction } from '../src/scenario/game.ts'
import { partyOf } from '../src/scenario/registry.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import { validateScenario } from '../src/scenario/validate.ts'
import { viewForScenario } from '../src/scenario/view.ts'

const SEATS = ['a', 'b', 'c'] as const
const STAIRS = [9, 11, 13] as const

const act = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(sc, g, a)
const ids = (g: ScenarioGame) => g.run.players.map((p) => p.id)

/** 모두 "계속"을 누른다 */
const ready = (g: ScenarioGame) => ids(g).reduce((s, id) => act(s, { type: 'ready', playerId: id }), g)
/** 읽는 단계(이야기·결과)에 있으면 넘긴다 */
const settle = (g: ScenarioGame) => (g.run.phase === 'story' || g.run.phase === 'result' ? ready(g) : g)

/** 개인·분할 장면: 사람마다 정한 선택지를 고른다 (정하지 않은 사람은 `rest`). 결과 화면에서 멈춘다. */
function pickEach(g: ScenarioGame, picks: string | Record<number, string>): ScenarioGame {
  let cur = g
  ids(g).forEach((id, i) => {
    const option = typeof picks === 'string' ? picks : (picks[i] ?? 'rest')
    cur = act(cur, { type: 'pick', playerId: id, actionId: option })
  })
  return cur
}
/** 위와 같고, 결과를 읽고 다음 장면까지 넘긴다 */
const personal = (g: ScenarioGame, picks: string | Record<number, string>) => settle(pickEach(g, picks))
/** 분할 장면: 사람 번호별 행동 (정하지 않은 사람은 `fallback`) */
const split = personal
const vote = (g: ScenarioGame, choiceId: string) =>
  settle(ids(g).reduce((s, id) => act(s, { type: 'vote', playerId: id, choiceId }), g))

/** 단서가 모이면 조사 뒤에 회의가 열린다. 답을 걸지 않고 더 조사한다. */
const hold = (g: ScenarioGame) => (g.run.nodeId === 'meeting' ? vote(g, 'hold') : g)

interface Plan {
  /** 전화에 어떻게 답하나: 정직 / 한 명 더 / 받지 않음 */
  phone: 'truth' | 'plus-one' | 'hang-up'
  /** 소파에 말 걸기: 맞는 곳 / 틀린 곳 / 두 곳 / 안 함 */
  greet: 'right' | 'wrong' | 'many' | 'none'
  /** 엘리베이터에서 나머지 사람들: 가만히 / 버튼 / 거울 */
  lift: 'still' | 'press' | 'mirror'
}

/**
 * 의도한 풀이를 따라 `until` 장면까지 간다. 장면 이름과 시계를 보고 정하므로 인원수가 달라 흐름이 달라도 된다
 * (3명 이상이면 조사 라운드가 하나 줄어든다).
 */
function drive(g0: ScenarioGame, until: string, phone: Plan['phone']): ScenarioGame {
  let g = g0
  let phoned = false
  for (let guard = 0; g.run.nodeId !== until; guard++) {
    assert.ok(guard < 60, `${until}에 닿지 못함 (지금 ${g.run.nodeId})`)
    const n = g.run.nodeId
    if (n === 'arrive') g = ready(g)
    else if (n === 'first-look') g = personal(g, 'desk')
    else if (n === 'survey') {
      if (g.run.time === 0) g = split(g, { 0: 'sofa-a', 1: 'sofa-b' }) // 소파를 나눠 살핀다 (나머지는 숨 고르기)
      else if (!phoned) g = split(g, { 0: 'phone', 1: 'panel' }) // 전화 + 패널
      else g = split(g, { 0: 'rail', 1: 'book' })
    } else if (n === 'phone-call') {
      phoned = true
      g = vote(g, phone)
    } else if (n === 'night') g = personal(g, 'train-body')
    else if (n === 'meeting') g = vote(g, 'hold') // 의도한 풀이는 회의에서 답을 걸지 않는다 (확신이 설 때까지 조사한다)
    else if (n === 'event-footsteps') g = vote(g, 'quiet')
    else if (n === 'gather') g = vote(g, 'elevator')
    else throw new Error(`예상하지 못한 장면: ${n}`)
  }
  return g
}

/** 의도한 풀이를 따라 엘리베이터 앞(`lift`)까지 간다 */
const toLift = (g0: ScenarioGame, phone: Plan['phone']) => drive(g0, 'lift', phone)

function finish(g: ScenarioGame, seat: string, plan: Plan): ScenarioGame {
  const wrong = SEATS.find((s) => s !== seat)!
  const other = SEATS.find((s) => s !== seat && s !== wrong)!
  const picks: Record<number, string> = {}
  if (plan.greet === 'right') picks[0] = `greet-${seat}`
  if (plan.greet === 'wrong') picks[0] = `greet-${wrong}`
  if (plan.greet === 'many') {
    picks[0] = `greet-${seat}`
    picks[1] = `greet-${other}`
  }
  const rest = plan.lift === 'still' ? 'still' : plan.lift
  // 나머지 사람들은 `rest`가 아니라 엘리베이터 행동(`still`·`press`·`mirror`)을 고른다
  const all: Record<number, string> = {}
  ids(g).forEach((_, i) => (all[i] = picks[i] ?? rest))
  return split(g, all)
}

function play(seat: string, stairs: number, n: number, plan: Plan): ScenarioGame {
  const g = createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { seat, stairs } })
  return finish(toLift(g, plan.phone), seat, plan)
}

// 0) 정적 검증
{
  const r = validateScenario(sc)
  assert.deepEqual(r.errors, [], r.errors.join('\n'))
  assert.deepEqual(r.warnings, [], r.warnings.join('\n'))
  console.log(`통과: 정적 검증 (장면 ${sc.nodes.length}개, 엔딩 ${sc.nodes.filter((n) => n.kind === 'ending').length}개)`)
}

// 1) 의도한 풀이는 모든 판·모든 인원에서 진엔딩이다
{
  let games = 0
  for (const n of [2, 3, 4, 6, 8]) {
    for (const seat of SEATS) {
      for (const stairs of STAIRS) {
        let g = play(seat, stairs, n, { phone: 'truth', greet: 'right', lift: 'still' })
        assert.equal(g.run.nodeId, 'ascend-true', `${n}명 seat=${seat} stairs=${stairs}`)
        g = ready(g)
        assert.equal(g.run.endingId, 'true-end')
        assert.equal(viewForScenario(sc, g, 'p1').ending!.tier, 'true')
        games++
      }
    }
  }
  console.log(`통과: 의도한 풀이로 진엔딩 (${games}판: 2·3·4·6·8명 × 소파 3 × 계단 3)`)
}

// 2) 흔한 실수는 의도한 결말로 이어진다
{
  const end = (seat: string, n: number, plan: Plan) => {
    let g = play(seat, 11, n, plan)
    for (let i = 0; i < 3 && g.run.phase !== 'ended'; i++) g = settle(g)
    return g.run.endingId
  }
  for (const seat of SEATS) {
    assert.equal(end(seat, 2, { phone: 'hang-up', greet: 'right', lift: 'still' }), 'quiet-end', '전화를 받지 않고 소파에만 말을 걸면 조용한 퇴근')
    assert.equal(end(seat, 3, { phone: 'plus-one', greet: 'right', lift: 'still' }), 'followed-end', '"한 명 더 있다"고 답하면 소파에 말을 걸어도 따라온다')
    assert.equal(end(seat, 2, { phone: 'truth', greet: 'wrong', lift: 'still' }), 'followed-end', '틀린 소파에 말을 걸면 따라온다')
    assert.equal(end(seat, 2, { phone: 'truth', greet: 'none', lift: 'still' }), 'followed-end', '소파에 말을 걸지 않으면 따라온다')
    assert.equal(end(seat, 3, { phone: 'truth', greet: 'many', lift: 'still' }), 'followed-end', '여러 소파에 동시에 말을 걸면(전부 찍기) 따라온다')
    assert.equal(end(seat, 2, { phone: 'truth', greet: 'right', lift: 'mirror' }), 'followed-end', '거울을 보면 한 명이 걸어 나온다')
  }
  console.log('통과: 흔한 실수 → 조용한 퇴근·한 명이 더 (전부 찍기 방지 포함)')
}

// 3) 버튼을 누르면 되돌아오고 대가를 치른다 (나중에 적용되는 효과), 다시 시도할 수 있다
{
  const atLift = toLift(createScenarioGame(sc, { seed: 1, players: partyOf(3), vars: { seat: 'a', stairs: 9 } }), 'truth')
  const before = atLift.run.players.map((p) => p.stats.sanity)
  let g = finish(atLift, 'a', { phone: 'truth', greet: 'right', lift: 'press' })
  assert.equal(g.run.nodeId, 'press-fail')
  // 누른 사람은 다쳤고, 모두의 정신력이 2씩 깎였다 (다음 장면에 들어오며 적용된 여파)
  assert.deepEqual(g.run.players.map((p) => p.stats.sanity), before.map((x) => Math.max(0, x - 2)))
  assert.ok(g.run.players.some((p) => p.hurt), '누른 사람이 다쳤다')
  const v = viewForScenario(sc, g, 'p1')
  assert.ok(v.aftermath.some((c) => c.kind === 'hurt'), '다친 사람이 여파로 보인다')
  assert.ok(v.aftermath.some((c) => c.kind === 'stat' && c.amount === -2), '정신력이 깎인 것도 여파로 보인다')
  g = ready(g)
  assert.equal(g.run.nodeId, 'gather', '시간은 흐르지 않고 다시 고를 수 있다')
  g = finish(vote(g, 'elevator'), 'a', { phone: 'truth', greet: 'right', lift: 'still' })
  assert.equal(g.run.nodeId, 'ascend-true', '한 번 실패한 뒤에도 풀면 진엔딩으로 가는 길이다')
  console.log('통과: 버튼을 누르면 되돌아오고(대가는 다음 장면에), 다시 풀 수 있다')
}

// 4) 계단: 센 숫자보다 하나 적게. 틀리면 대가를 치르고 돌아온다.
{
  const toGather = (stairs: number) => {
    let g = createScenarioGame(sc, { seed: 1, players: partyOf(2), vars: { seat: 'a', stairs } })
    g = ready(g)
    g = personal(g, 'desk')
    g = hold(split(g, { 0: 'sofa-a', 1: 'sofa-b' }))
    g = vote(personal(g, 'train-body'), 'quiet') // 첫 밤 뒤 발소리
    g = hold(split(g, { 0: 'rail', 1: 'book' }))
    g = personal(g, 'train-body')
    assert.equal(g.run.nodeId, 'gather')
    return g
  }
  const right = { 9: 'n8', 11: 'n10', 13: 'n12' } as const
  for (const stairs of STAIRS) {
    let g = vote(toGather(stairs), 'stairs')
    assert.equal(g.run.nodeId, 'stairs-vote')
    g = vote(g, right[stairs])
    assert.equal(g.run.endingId, 'below-end', `난간 기둥 ${stairs}개 → ${right[stairs]}`)
  }
  let g = vote(toGather(9), 'stairs')
  g = ids(g).reduce((s, id) => act(s, { type: 'vote', playerId: id, choiceId: 'n12' }), g) // 틀림 (이야기 장면에서 멈춰 본다)
  assert.equal(g.run.nodeId, 'stairs-lost')
  assert.ok(viewForScenario(sc, g, 'p1').aftermath.some((c) => c.kind === 'stat' && c.amount === -2), '대가가 여파로 보인다')
  const t0 = g.run.time
  g = ready(g)
  assert.equal(g.run.nodeId, 'gather')
  assert.ok(g.run.time >= t0)
  console.log('통과: 계단(센 수보다 하나 적게, 틀리면 대가)')
}

// 5) 단서는 사람마다 다르게 얻는다: 소파를 만진 사람만 따뜻한지 안다
{
  let g = createScenarioGame(sc, { seed: 1, players: partyOf(2), vars: { seat: 'b', stairs: 9 } })
  g = personal(ready(g), 'desk')
  g = pickEach(g, { 0: 'sofa-a', 1: 'sofa-b' })
  const v0 = viewForScenario(sc, g, 'p1').result!
  const v1 = viewForScenario(sc, g, 'p2').result!
  assert.match(v0.mine!.text, /왼쪽 소파는 차갑다/)
  assert.match(v1.mine!.text, /가운데 소파는 방금까지 누가 앉았던 것처럼 따뜻하다/)
  assert.ok(!JSON.stringify(v0).includes('따뜻'), '남이 만진 소파의 온기는 전달되지 않는다')
  const notes = (who: string) => viewForScenario(sc, g, who).notebook.map((f) => f.id) // 판마다 바뀌는 값에 대한 사실은 노트에 보이지 않는다
  assert.deepEqual(notes('p1'), ['book-date'], '첫 인상에서 방명록을 본 p1의 노트')
  assert.ok(notes('p2').includes('warm-seat'))
  assert.ok(!notes('p1').includes('warm-seat'))
  // 소거: 두 소파가 모두 차가우면 남은 소파(오른쪽)가 따뜻하다 — 말로 합쳐서 추리한다
  const cold = pickEach(personal(ready(createScenarioGame(sc, { seed: 1, players: partyOf(2), vars: { seat: 'c', stairs: 9 } })), 'desk'), { 0: 'sofa-a', 1: 'sofa-b' })
  assert.match(viewForScenario(sc, cold, 'p1').result!.mine!.text, /차갑다/)
  assert.match(viewForScenario(sc, cold, 'p2').result!.mine!.text, /차갑다/)
  console.log('통과: 단서는 사람마다 다르게 보인다')
}

// 6) 전화: {players}가 인원수로 바뀐다 (인원이 달라도 조사 흐름을 따라 전화 장면에 닿는다)
{
  for (const n of [2, 3, 4]) {
    const g = drive(createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { seat: 'a', stairs: 9 } }), 'phone-call', 'truth')
    const truth = viewForScenario(sc, g, 'p1').scene!.choices.find((c) => c.id === 'truth')!
    assert.equal(truth.text, `“${n}명입니다.”`)
  }
  console.log('통과: 전화 선택지에 인원수가 들어간다')
}

// 6-2) 조사 라운드는 인원과 상관없이 두 번이다 (한 곳은 한 번만 살필 수 있어, 칸보다 곳이 많다)
{
  const rounds = (n: number) => {
    let g = createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { seat: 'a', stairs: 9 } })
    let surveys = 0
    for (let guard = 0; g.run.nodeId !== 'gather' && guard < 60; guard++) {
      if (g.run.nodeId === 'survey') surveys++
      g = drive(g, g.run.nodeId === 'arrive' ? 'first-look' : g.run.nodeId, 'truth')
      const n0 = g.run.nodeId
      g = n0 === 'first-look' ? personal(g, 'desk') : n0 === 'survey' ? split(g, {}) : n0 === 'night' ? personal(g, 'train-body') : n0 === 'event-footsteps' ? vote(g, 'quiet') : g
    }
    return surveys
  }
  for (const n of [2, 3, 4]) assert.equal(rounds(n), 2, `${n}명도 조사 라운드는 두 번`)
  console.log('통과: 조사 라운드는 인원과 상관없이 두 번이다')
}

// 6-3) 밤의 능력치: 체력·관찰 훈련, 휴식으로 정신력 회복, 행운은 동전으로. 행운이 기준선(3)에 닿으면 서랍이 열린다.
{
  // 신입(행운 2)과 연구원(관찰 4): 신입은 행운이 기준선 3에 한 걸음 모자라다
  const roster = [
    { id: 'p1', name: '가', archetype: 'rookie' },
    { id: 'p2', name: '나', archetype: 'researcher' },
  ]
  let g = createScenarioGame(sc, { seed: 1, players: roster, vars: { seat: 'a', stairs: 9 } })
  const start = g.run.players.map((p) => ({ ...p.stats }))
  g = drive(g, 'night', 'truth')
  const nightView = viewForScenario(sc, g, 'p1')
  // 밤 선택지: 체력·관찰·휴식·행운(동전)이 모두 있고, 서랍은 행운 기준선에 못 미치면 잠겨 있다
  const ids = nightView.scene!.choices.map((c) => c.id)
  for (const id of ['train-body', 'study', 'rest', 'coin', 'drawer', 'elevator-peek', 'stairs-peek']) assert.ok(ids.includes(id), id)
  const drawerLock = nightView.scene!.choices.find((c) => c.id === 'drawer')!
  const luck0 = g.run.players[0].stats.luck
  assert.ok(luck0 < 3, `시험용 파티의 행운은 기준선 미만이다 (${luck0})`)
  assert.ok(drawerLock.locked, '서랍은 행운이 모자라면 잠겨 있다')

  g = pickEach(g, { 0: 'coin', 1: 'study' })
  assert.equal(g.run.players[0].stats.luck, luck0 + 1, '동전을 찾으면 행운 +1')
  assert.equal(g.run.players[1].stats.insight, start[1].insight + 1, '방명록을 다시 읽으면 관찰 +1')
  g = settle(g)

  // 휴식은 정신력을 회복한다 (깎인 뒤에)
  let r = drive(createScenarioGame(sc, { seed: 1, players: roster, vars: { seat: 'a', stairs: 9 } }), 'night', 'truth')
  r = structuredClone(r)
  r.run.players[0].stats.sanity = 3
  r = pickEach(r, { 0: 'rest', 1: 'train-body' })
  assert.equal(r.run.players[0].stats.sanity, 6, '쉬면 정신력 +3')
  assert.equal(r.run.players[1].stats.body, start[1].body + 1, '단련하면 체력 +1')

  // 행운이 3이 되면 다음 밤에 서랍이 열려 손전등을 얻는다
  let l = drive(createScenarioGame(sc, { seed: 1, players: roster, vars: { seat: 'a', stairs: 9 } }), 'night', 'truth')
  l = structuredClone(l)
  l.run.players[0].stats.luck = 2
  l = pickEach(l, { 0: 'coin' }) // 행운 3
  l = act(l, { type: 'pick', playerId: 'p2', actionId: 'rest' })
  assert.equal(l.run.players[0].stats.luck, 3)
  l = drive(settle(l), 'night', 'truth')
  const open = viewForScenario(sc, l, 'p1').scene!.choices.find((c) => c.id === 'drawer')!
  assert.equal(open.locked, undefined, '행운 3이면 서랍이 열린다')
  l = pickEach(l, { 0: 'drawer' })
  assert.ok(l.run.players[0].items.includes('torch'), '손전등을 얻는다')
  console.log('통과: 밤의 능력치(체력·관찰·정신력·행운) 올리기와 행운 기준선')
}

// 7) 마감(암전)과 전원 정신 상실
{
  // 계속 미루면 조명이 완전히 꺼진다
  let g = createScenarioGame(sc, { seed: 1, players: partyOf(2), vars: { seat: 'a', stairs: 9 } })
  g = personal(ready(g), 'desk')
  g = vote(personal(split(g, {}), 'train-body'), 'quiet')
  g = personal(split(g, {}), 'train-body')
  assert.equal(g.run.nodeId, 'gather')
  g = vote(g, 'wait')
  assert.equal(g.run.nodeId, 'survey')
  g = personal(split(g, {}), 'train-body')
  assert.equal(g.run.nodeId, 'gather')
  g = vote(g, 'wait')
  assert.equal(g.run.endingId, 'blackout-end', '결정을 계속 미루면 시계가 5가 되어 암전')

  // 전원이 정신을 잃은 채 다음 장면으로 가면 정신 상실: 정신을 잃은 사람은 투표할 수 없고, 아무도 못 고르면 다음으로 가려는 순간 엔딩이다
  const at = createScenarioGame(sc, { seed: 1, players: partyOf(2), vars: { seat: 'a', stairs: 9 } })
  let c = personal(ready(at), 'desk')
  c = vote(personal(split(c, {}), 'train-body'), 'quiet')
  c = personal(split(c, {}), 'train-body')
  assert.equal(c.run.nodeId, 'gather')
  c = structuredClone(c)
  c.run.players.forEach((p) => (p.stats.sanity = 0))
  assert.equal(act(c, { type: 'vote', playerId: 'p1', choiceId: 'elevator' }), c, '정신을 잃은 사람은 투표할 수 없다')
  c = settle(act(c, { type: 'force' })) // 고른 길의 해설(결과 화면)을 넘기면 다음 장면에 들어가며 정신 상실로 끝난다
  assert.equal(c.run.endingId, 'collapse-end')
  console.log('통과: 암전과 정신 상실')
}

// 8) 조사 보드와 회의: 단서가 의문에 붙고, 답을 바로 골라 걸면 실제로 해 보고, 틀리면 대가를 치르며 그 답이 지워진다
{
  const mk = (seat: string, stairs: number) => createScenarioGame(sc, { seed: 1, players: partyOf(2), vars: { seat, stairs } })
  const voteRaw = (g: ScenarioGame, choiceId: string) => ids(g).reduce((s, id) => act(s, { type: 'vote', playerId: id, choiceId }), g)
  const back = (g: ScenarioGame) => {
    const c = structuredClone(g) // 틀린 답 뒤 다음 회의에 선 상태 (실제로는 밤과 조사를 거쳐 회의가 다시 열린다)
    Object.assign(c.run, { nodeId: 'meeting', phase: 'vote', votes: {}, ready: [] })
    return c
  }
  const choiceIds = (g: ScenarioGame, who = 'p1') => viewForScenario(sc, g, who).scene!.choices.map((c) => c.id)
  const sanity = (g: ScenarioGame) => g.run.players.map((p) => p.stats.sanity)

  // 처음에는 아무 의문도 보이지 않고, 목표만 있다
  let g = mk('b', 11)
  const v0 = viewForScenario(sc, g, 'p1')
  assert.match(v0.board!.goal, /조명이 완전히 꺼지기 전에/)
  assert.ok(v0.board!.questions.every((q) => q.text === null && !q.solved && q.clues.length === 0))

  // 소파를 만져 본 뒤: 단서가 없는 의문은 숨고, 소파 의문이 모두에게 보이며, 내가 아는 단서만 붙는다
  g = split(personal(ready(g), 'desk'), { 0: 'sofa-b', 1: 'sofa-a' })
  assert.equal(g.run.nodeId, 'meeting')
  const bp1 = viewForScenario(sc, g, 'p1').board!.questions
  const bp2 = viewForScenario(sc, g, 'p2').board!.questions
  assert.deepEqual(bp1.map((q) => q.text !== null), [false, true, false])
  assert.deepEqual(bp2.map((q) => q.text !== null), [false, true, false], '다른 사람이 아는 의문도 보인다 (단서는 안 보인다)')
  assert.deepEqual(bp1[1].clues.map((c) => c.id).sort(), ['warm-b', 'warm-seat'])
  assert.deepEqual(bp2[1].clues.map((c) => c.id), ['cold-a'])
  // 회의는 한 번에 답을 고른다: 풀 수 있는 의문의 답과 "답을 걸지 않는다"만 오른다
  assert.deepEqual(choiceIds(g), ['sofa-a', 'sofa-b', 'sofa-c', 'hold'])

  // 틀린 답: 실제로 해 보고 대가를 치르며, 그 답은 지워지고, 차갑다는 것이 모두의 단서로 붙는다
  const before = sanity(g)
  const time0 = g.run.time
  const wrongA = voteRaw(g, 'sofa-a')
  assert.equal(wrongA.run.nodeId, 'sofa-wrong-a')
  assert.deepEqual(sanity(wrongA), before.map((x) => x - 2), '틀리면 모두의 정신력이 크게 깎인다')
  assert.equal(wrongA.run.time, time0, '시간은 흐르지 않는다 (조사 라운드가 두 번뿐이라)')
  assert.ok(wrongA.run.flags.includes('no-sofa-a') && !wrongA.run.flags.includes('solved-sofa'))
  assert.ok(viewForScenario(sc, wrongA, 'p1').board!.questions[1].clues.some((c) => c.id === 'cold-a'), '아닌 것으로 밝혀진 소파가 보드에 붙는다')
  assert.deepEqual(choiceIds(back(wrongA)), ['sofa-b', 'sofa-c', 'hold'], '틀린 답은 다시 고를 수 없다')

  // 맞는 답: 확정되고 모두가 안다. 판마다 다른 값은 단서 노트에 남지 않는다.
  const right = voteRaw(g, 'sofa-b')
  assert.equal(right.run.nodeId, 'sofa-right')
  assert.ok(right.run.flags.includes('solved-sofa'))
  assert.deepEqual(sanity(right), before, '맞으면 대가가 없다')
  const rb = viewForScenario(sc, right, 'p2').board!.questions[1]
  assert.equal(rb.solved, true)
  assert.equal(rb.answer, '가운데 소파다.')
  assert.ok(right.run.players.every((p) => p.facts.includes('warm-seat')))
  const vn = viewForScenario(sc, right, 'p1').notebook.map((f) => f.id)
  assert.ok(vn.includes('warm-seat') && !vn.includes('warm-b') && !vn.includes('cold-a'), '판마다 바뀌는 값은 단서 노트에 남지 않는다')

  // 모두 찍어 보는 것은 비싸다: 틀린 두 번이면 모두의 정신력이 4나 깎인다
  const twice = voteRaw(back(wrongA), 'sofa-c')
  assert.deepEqual(sanity(twice), before.map((x) => x - 4))
  assert.deepEqual(choiceIds(back(twice)), ['sofa-b', 'hold'], '남은 답은 하나')

  // 답을 걸지 않으면 대가 없이 밤으로
  assert.equal(voteRaw(g, 'hold').run.nodeId, 'night')

  // 세 의문이 모두 풀리면 회의는 건너뛴다
  let done = mk('b', 11)
  done.run.flags.push('solved-lift', 'solved-sofa', 'solved-stairs')
  done = split(personal(ready(done), 'desk'), { 0: 'sofa-b', 1: 'sofa-a' })
  assert.equal(done.run.nodeId, 'night')

  // 계단: 센 수와 규칙으로 맞히면 확정, 틀리면 그 칸이 지워진다
  let st = mk('b', 11)
  st = split(personal(ready(st), 'desk'), { 0: 'rail', 1: 'book' })
  assert.equal(st.run.nodeId, 'meeting')
  assert.deepEqual(choiceIds(st), ['stairs-9', 'stairs-11', 'stairs-13', 'hold'])
  assert.deepEqual(viewForScenario(sc, st, 'p1').board!.questions[2].clues.map((c) => c.id).sort(), ['rail-near10', 'stairs-count'], '손전등 없이 더듬어 센 수는 정확하지 않다 (아홉이거나 열하나)')
  // 손전등이 있으면 정확하고, 열셋일 때는 더듬어도 "열두 개를 넘는다"고 가려진다
  const torchRail = (stairs: number, torch: boolean) => {
    let t = mk('b', stairs)
    if (torch) t.run.players[0].items.push('torch')
    t = split(personal(ready(t), 'desk'), { 0: 'rail', 1: 'book' })
    return viewForScenario(sc, t, 'p1').board!.questions[2].clues.map((c) => c.id).sort()
  }
  assert.deepEqual(torchRail(11, true), ['rail-11', 'stairs-count'])
  assert.deepEqual(torchRail(13, false), ['rail-over12', 'stairs-count'])
  assert.deepEqual(torchRail(9, false), ['rail-near10', 'stairs-count'], '9와 11은 더듬어서는 구별되지 않는다')
  // 한 곳은 한 번만 살필 수 있다
  const once = split(personal(ready(mk('b', 11)), 'desk'), { 0: 'rail', 1: 'book' })
  assert.ok(once.run.flags.includes('seen-rail') && once.run.flags.includes('seen-book'))
  assert.equal(voteRaw(st, 'stairs-11').run.nodeId, 'stairs-right')
  assert.equal(voteRaw(st, 'stairs-9').run.nodeId, 'stairs-wrong-9')
  assert.equal(viewForScenario(sc, voteRaw(st, 'stairs-11'), 'p1').board!.questions[2].answer, '열 칸이다. (센 숫자보다 하나 적게)')
  console.log('통과: 조사 보드와 회의 (단서 붙기·답 걸기·대가·지워짐·확정)')
}
