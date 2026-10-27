// B7 로비 공략 시험: 의도한 풀이가 모든 판(과제 순서 6 × 따뜻한 소파 3 × 난간 기둥 3 × 여러 인원)에서 진엔딩에 닿는지,
// 흔한 실수가 의도한 결말로 이어지는지, 과제마다 단서가 정확히 하나의 답으로 모이는지.
// (전수 탐색은 탐색기 화면이나 `npm run explore -- b7-lobby 2`로 따로 돌린다.)
import assert from 'node:assert/strict'
import { b7Lobby as sc, SOFA_NOTES, STAIR_CLUES, type SeatId, type StairsCount } from '../src/content/scenarios/b7-lobby.ts'
import { createScenarioGame, reduceScenario, type ScenarioAction } from '../src/scenario/game.ts'
import { partyOf } from '../src/scenario/registry.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import { validateScenario } from '../src/scenario/validate.ts'
import { viewForScenario } from '../src/scenario/view.ts'

const SEATS: SeatId[] = ['a', 'b', 'c']
const STAIRS: StairsCount[] = [9, 11, 13]
const TASKS = ['lift', 'sofa', 'stairs'] as const
const ORDERS = TASKS.flatMap((x) =>
  TASKS.filter((y) => y !== x).map((y) => [x, y, TASKS.find((z) => z !== x && z !== y)!].join('>')),
)

const act = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(sc, g, a)
const ids = (g: ScenarioGame) => g.run.players.map((p) => p.id)
const ready = (g: ScenarioGame) => ids(g).reduce((s, id) => act(s, { type: 'ready', playerId: id }), g)
const settle = (g: ScenarioGame) => (g.run.phase === 'story' || g.run.phase === 'result' ? ready(g) : g)
/** 모두 같은 선택지를 고른다 (투표) */
const voteAll = (g: ScenarioGame, choiceId: string) => ids(g).reduce((s, id) => act(s, { type: 'vote', playerId: id, choiceId }), g)
/** 사람마다 정한 행동을 고른다 (정하지 않은 사람은 `fallback`) */
const pickEach = (g: ScenarioGame, picks: Record<number, string>, fallback: string) =>
  ids(g).reduce((s, id, i) => act(s, { type: 'pick', playerId: id, actionId: picks[i] ?? fallback }), g)
const view = (g: ScenarioGame, id = 'p1') => viewForScenario(sc, g, id)

/** 사실이 적힌 쪽지가 "차갑다"고 말하는 소파 (따뜻한 자리 a → 가운데 b, b → 오른쪽 c, c → 왼쪽 a) */
const COLD_SAID: Record<SeatId, SeatId> = { a: 'b', b: 'c', c: 'a' }

/** 과제마다 추리 사슬에서 단계별로 맞는 보기의 id (마지막이 예전의 답과 같다) */
function chainRight(task: (typeof TASKS)[number], seat: SeatId, stairs: StairsCount): string[] {
  if (task === 'lift') return ['press-back', 'mirror-skip', 'wait-still', 'still']
  if (task === 'sofa') return ['notes-one', `true-${SOFA_NOTES[seat].find((n) => n.holds(seat))!.pos}`, `says-cold-${COLD_SAID[seat]}`, `sofa-${seat}`]
  return ['rel-less', `pillars-${stairs}`, `s${stairs - 1}`]
}

interface Plan {
  /** 전화에 어떻게 답하나 */
  phone: 'truth' | 'plus-one' | 'hang-up'
  /** 발소리 사건에서 */
  footsteps: 'quiet' | 'follow' | 'count-aloud'
}
const GOOD: Plan = { phone: 'truth', footsteps: 'quiet' }

/**
 * 의도한 풀이를 따라 `until` 장면까지 간다. 조사에서는 아무도 살피지 않고 기다리고(`<과제>-wait`), 추리에서는 바로 정답을 건다 —
 * 단서를 모으는 길은 아래 3)~5)가 따로 본다.
 */
function drive(g0: ScenarioGame, until: string, seat: SeatId, stairs: StairsCount, plan: Plan = GOOD): ScenarioGame {
  let g = g0
  for (let guard = 0; g.run.nodeId !== until; guard++) {
    assert.ok(guard < 80, `${until}에 닿지 못함 (지금 ${g.run.nodeId})`)
    const n = g.run.nodeId
    const task = TASKS.find((t) => n.startsWith(`${t}-`))
    if (g.run.phase === 'result') g = ready(g) // 고른 것의 결과를 읽는다
    else if (n === 'arrive' || n === 'sign-story') g = ready(g)
    else if (n === 'first-look') g = settle(pickEach(g, {}, 'desk'))
    else if (task && n === `${task}-probe`) g = pickEach(g, {}, `${task}-wait`)
    else if (task && n === `${task}-think`) g = voteAll(g, `${task}-reason`) // 추리를 시작한다
    else if (task && /-c\d$/.test(n)) g = voteAll(g, chainRight(task, seat, stairs)[Number(n.slice(-1)) - 1]) // 추리 사슬의 단계
    else if (task) g = ready(g) // 소개·사슬의 근거 이야기·풀렸다
    else if (n === 'event-footsteps') g = voteAll(g, plan.footsteps)
    else if (n === 'phone-call') g = voteAll(g, plan.phone)
    else if (n === 'night') g = settle(pickEach(g, {}, 'train-body'))
    else if (n === 'gather') g = voteAll(g, 'elevator')
    else throw new Error(`예상하지 못한 장면: ${n}`)
  }
  return g
}

/** 위험한 곳이 아무 조사에도 걸리지 않는 값 (기본). 위험한 곳 시험(13)만 특정 조사를 고른다. */
const NO_RISK = { 'risk-lift': 'off', 'risk-sofa': 'off', 'risk-stairs': 'off' }

/** `extra`로 사건 순서(events)나 위험한 곳(risk-<과제>)을 정할 수 있다. 기본은 발소리가 먼저이고 위험한 곳이 없다. */
const start = (n: number, order: string, seat: SeatId, stairs: StairsCount, extra: Record<string, string> = {}) =>
  createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { order, seat, stairs, events: 'fp', ...NO_RISK, ...extra } })

/** 마지막 선택에서 엘리베이터를 골라 `lift`까지 간 뒤, 엘리베이터 앞에서 각자 행동한다 */
function atLift(n: number, order: string, seat: SeatId, stairs: StairsCount, plan: Plan = GOOD) {
  return drive(start(n, order, seat, stairs), 'lift', seat, stairs, plan)
}
type LiftPlan = { greet: 'right' | 'wrong' | 'many' | 'none'; lift: 'still' | 'press' | 'mirror' }
function liftActions(g: ScenarioGame, seat: SeatId, plan: LiftPlan): ScenarioGame {
  const wrong = SEATS.find((s) => s !== seat)!
  const other = SEATS.find((s) => s !== seat && s !== wrong)!
  const picks: Record<number, string> = {}
  if (plan.greet === 'right') picks[0] = `greet-${seat}`
  if (plan.greet === 'wrong') picks[0] = `greet-${wrong}`
  if (plan.greet === 'many') {
    picks[0] = `greet-${seat}`
    picks[1] = `greet-${other}`
  }
  return settle(pickEach(g, picks, plan.lift)) // 엘리베이터 앞의 결과를 읽고 넘긴다
}
/** 엔딩에 닿을 때까지 읽고 넘긴다 */
const toEnd = (g: ScenarioGame) => {
  for (let i = 0; i < 4 && g.run.phase !== 'ended'; i++) g = settle(g)
  return g
}
const endingOf = (g: ScenarioGame) => toEnd(g).run.endingId

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
  for (const n of [2, 3, 5, 8]) {
    for (const order of ORDERS) {
      for (const seat of SEATS) {
        for (const stairs of STAIRS) {
          const g = liftActions(atLift(n, order, seat, stairs), seat, { greet: 'right', lift: 'still' })
          assert.equal(g.run.nodeId, 'ascend-true', `${n}명 ${order} seat=${seat} stairs=${stairs}`)
          assert.equal(g.run.time, 2, '풀어도 하루는 지난다: 밤이 두 번 지나 3일째다')
          assert.deepEqual(view(g).light, { max: 4, level: 1 }, '3일째이므로 조명은 한 번 어두워졌다 (2일째에 어두워졌다)')
          assert.equal(endingOf(g), 'true-end')
          assert.equal(view(toEnd(g)).ending?.tier, 'true')
          games++
        }
      }
    }
  }
  console.log(`통과: 의도한 풀이로 진엔딩 (${games}판: 2·3·5·8명 × 과제 순서 6 × 소파 3 × 계단 3)`)
}

// 2) 과제 사이에는 사건과 밤이 있다: 첫 과제 뒤 발소리 → 밤, 둘째 과제 뒤 전화 → 밤, 셋째 과제 뒤 바로 마지막 선택
{
  const g = atLift(2, ORDERS[0], 'a', 9)
  const v = g.run.visited
  const pos = (id: string) => v.indexOf(id)
  const firstTask = ORDERS[0].split('>')[0]
  const secondTask = ORDERS[0].split('>')[1]
  const thirdTask = ORDERS[0].split('>')[2]
  assert.ok(pos(`${firstTask}-right`) < pos('event-footsteps') && pos('event-footsteps') < v.indexOf('night'), '첫 과제 뒤에 발소리와 밤')
  assert.ok(pos(`${secondTask}-intro`) > v.indexOf('night'), '밤이 끝나면 둘째 과제')
  assert.ok(pos(`${secondTask}-right`) < pos('phone-call'), '둘째 과제 뒤에 전화')
  assert.equal(v.filter((x) => x === 'night').length, 2, '밤은 두 번')
  assert.ok(pos(`${thirdTask}-right`) < pos('gather') && v.indexOf('night', pos(`${thirdTask}-right`)) === -1, '셋째 과제 뒤에는 바로 마지막 선택')
  assert.ok(v.filter((x) => x.endsWith('-intro')).length === 3)
  console.log('통과: 과제 사이의 사건(발소리·전화)과 밤')
}

// 3) 소파 쪽지: 어느 자리가 따뜻해도 "사실인 쪽지는 한 장뿐"이라는 규칙으로 가리면 답이 하나로 정해진다
{
  for (const seat of SEATS) {
    const notes = SOFA_NOTES[seat]
    assert.equal(notes.length, 3)
    const consistent = SEATS.filter((w) => notes.filter((n) => n.holds(w)).length === 1)
    assert.deepEqual(consistent, [seat], `${seat}: 규칙에 맞는 따뜻한 자리가 하나뿐이다`)
    // 사실인 쪽지는 이 자리에서 참인 한 장이고, 오래된 잉크로 가려진다 (2단계 조사)
    assert.equal(notes.filter((n) => n.holds(seat)).length, 1)
  }
  console.log('통과: 소파 쪽지 세트마다 답이 유일하다')
}

// 4) 계단 단서: 1단계 조사의 두 단서를 겹치면 기둥 수가 정확히 하나로 정해지고, 답은 기둥 수보다 하나 적은 칸이다
{
  for (const n of STAIRS) {
    const sets = STAIR_CLUES[n].map((c) => c.candidates)
    assert.equal(sets.length, 2)
    for (const s of sets) assert.ok(s.includes(n) && s.length === 2, `${n}: 각 단서는 후보 둘로 좁힌다`)
    const both = [9, 11, 13].filter((x) => sets.every((s) => s.includes(x)))
    assert.deepEqual(both, [n], `${n}: 두 단서를 겹치면 하나만 남는다`)
  }
  // 실제 조사로도 같은 단서가 나온다 (두 사람이 센 방식을 나눠 맡는다)
  for (const n of STAIRS) {
    let g = start(2, 'stairs>lift>sofa', 'a', n)
    for (const node of ['arrive', 'first-look', 'stairs-intro']) {
      assert.equal(g.run.nodeId, node)
      g = node === 'first-look' ? settle(pickEach(g, {}, 'desk')) : ready(g)
    }
    assert.equal(g.run.nodeId, 'stairs-probe')
    g = pickEach(g, { 0: 'feel', 1: 'half' }, 'stairs-wait')
    const learned = new Set(g.run.players.flatMap((p) => p.facts))
    for (const c of STAIR_CLUES[n]) assert.ok(learned.has(c.id), `${n}: ${c.id}`)
    const clues = view(g).clues.map((c) => c.id).filter((id) => id !== 'book-date').sort() // 첫 인상에서 얻은 방명록 단서는 뺀다
    assert.deepEqual(clues, STAIR_CLUES[n].map((c) => c.id).sort())
  }
  console.log('통과: 계단 단서가 기둥 수 하나로 모인다')
}

// 5) 과제의 대가: 오답은 조명·정신력, 패스는 조명만, 새 조사가 열린다 (엘리베이터)
{
  let g = start(2, 'lift>sofa>stairs', 'b', 11)
  for (const node of ['arrive', 'first-look', 'lift-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'desk')) : ready(g)
  assert.deepEqual(view(g).scene!.choices.map((c) => c.id), ['panel', 'glance', 'lift-wait'], '처음에는 1단계 조사만')
  g = pickEach(g, { 0: 'panel', 1: 'glance' }, 'lift-wait')
  g = settle(g)
  assert.equal(g.run.nodeId, 'lift-think')
  const sanity = g.run.players[0].stats.sanity
  g = voteAll(voteAll(g, 'lift-reason'), 'press-up') // 추리를 시작했지만 첫 단계에서 틀렸다
  assert.equal(g.run.nodeId, 'lift-c1-wrong-press-up-1')
  assert.equal(g.run.time, 0, '오답을 골라도 하루가 저물기 전에는 시계가 그대로다 (시계는 밤이 지나 새 낮이 올 때 흐른다)')
  assert.equal(view(g).clockLabel, '조명이 환하다')
  for (const p of g.run.players) assert.equal(p.stats.sanity, sanity - 2, '정신력은 깎인다')
  // 오답 뒤에는 밤이 온다: 이 과제의 개인 선택지(단서·아이템)와 스텟 선택지가 나온다
  g = settle(g)
  assert.equal(g.run.nodeId, 'lift-night')
  assert.equal(g.run.phase, 'personal')
  assert.deepEqual(view(g).scene!.choices.map((c) => c.id), ['listen', 'scrawl', 'drawer', 'train-body', 'study', 'rest'])
  g = settle(pickEach(g, {}, 'train-body'))
  assert.equal(g.run.nodeId, 'lift-probe', '밤이 끝나면 같은 과제의 조사로 돌아온다')
  assert.equal(g.run.time, 1, '1일째가 지나고 2일째 낮이 되었다')
  assert.deepEqual(view(g).timeOfDay, { day: 2, period: 'day' })
  assert.equal(view(g).clockLabel, '조명이 깜빡인다', '2일째에 조명이 한 번 어두워진다')
  assert.deepEqual(view(g).light, { max: 4, level: 1 })
  assert.deepEqual(view(g).scene!.choices.map((c) => c.id), ['press', 'still', 'pair', 'lift-wait'], '2단계 조사가 열리고 1단계는 이미 살폈다')
  // 패스도 하루를 보내고 밤이 온다. 정신력은 깎지 않는다. 3일째는 그대로, 4일째에 다시 어두워진다.
  g = pickEach(g, {}, 'lift-wait')
  const s2 = g.run.players[0].stats.sanity
  g = voteAll(g, 'lift-pass')
  assert.equal(g.run.time, 1, '패스해도 하루가 저물기 전에는 시계가 그대로다')
  assert.equal(g.run.players[0].stats.sanity, s2, '패스는 정신력을 깎지 않는다')
  g = settle(pickEach(settle(g), {}, 'rest'))
  assert.equal(g.run.nodeId, 'lift-probe')
  assert.deepEqual(view(g).timeOfDay, { day: 3, period: 'day' })
  assert.equal(view(g).clockLabel, '조명이 깜빡인다', '3일째에는 조명이 그대로다')
  g = voteAll(pickEach(g, {}, 'lift-wait'), 'lift-pass')
  g = settle(pickEach(settle(g), {}, 'rest'))
  assert.deepEqual(view(g).timeOfDay, { day: 4, period: 'day' })
  assert.equal(view(g).clockLabel, '조명이 흐려진다', '4일째에 조명이 또 한 번 어두워진다')
  assert.deepEqual(view(g).light, { max: 4, level: 2 })
  console.log('통과: 오답·패스의 대가(정신력)와 밤, 이틀에 한 번 어두워지는 조명')
}

// 6) 흔한 실수는 의도한 결말로 이어진다
{
  const seat: SeatId = 'b'
  const end = (n: number, plan: Plan, lift: LiftPlan) => endingOf(liftActions(atLift(n, ORDERS[0], seat, 11, plan), seat, lift))
  assert.equal(end(2, { phone: 'hang-up', footsteps: 'quiet' }, { greet: 'right', lift: 'still' }), 'bad-end', '전화를 받지 않으면 진엔딩이 안 된다')
  assert.equal(end(3, { phone: 'plus-one', footsteps: 'quiet' }, { greet: 'right', lift: 'still' }), 'bad-end', '"한 명 더 있다"고 답하면 따라온다')
  assert.equal(end(3, { phone: 'truth', footsteps: 'count-aloud' }, { greet: 'right', lift: 'still' }), 'bad-end', '소리 내어 인원을 세면 초대한 것이다')
  assert.equal(end(2, GOOD, { greet: 'wrong', lift: 'still' }), 'bad-end', '틀린 소파에 말을 걸면 따라온다')
  assert.equal(end(2, GOOD, { greet: 'none', lift: 'still' }), 'bad-end', '소파에 말을 걸지 않으면 따라온다')
  assert.equal(end(3, GOOD, { greet: 'many', lift: 'still' }), 'bad-end', '여러 소파에 동시에 말을 걸면(전부 찍기) 따라온다')
  assert.equal(end(2, GOOD, { greet: 'right', lift: 'mirror' }), 'bad-end', '거울을 보면 한 명이 걸어 나온다')
  console.log('통과: 흔한 실수 → 한 명이 더')
}

// 7) 버튼을 누르면 되돌아오고(조명·정신력·부상), 다시 시도할 수 있다
{
  const seat: SeatId = 'a'
  const lift = atLift(3, ORDERS[0], seat, 9)
  const before = lift.run.players.map((p) => p.stats.sanity)
  const t0 = lift.run.time
  let g = liftActions(lift, seat, { greet: 'right', lift: 'press' })
  assert.equal(g.run.nodeId, 'press-fail')
  assert.equal(g.run.time, t0 + 1, '시간이 한참 흘러 하루가 더 지났다')
  assert.equal(view(g).light!.level, view(lift).light!.level + 1, '조명이 한 단계 어두워졌다')
  assert.deepEqual(g.run.players.map((p) => p.stats.sanity), before.map((x) => Math.max(0, x - 2)))
  assert.ok(g.run.players.some((p) => p.hurt), '누른 사람이 다쳤다')
  g = ready(g)
  assert.equal(g.run.nodeId, 'gather')
  g = liftActions(settle(voteAll(g, 'elevator')), seat, { greet: 'right', lift: 'still' })
  assert.equal(g.run.nodeId, 'ascend-true', '한 번 실패한 뒤에도 풀면 진엔딩으로 가는 길이다')
  console.log('통과: 버튼을 누르면 되돌아오고, 다시 풀 수 있다')
}

// 8) 계단: 알아낸 칸 수로 내려가면 일반 엔딩, 틀리면 대가를 치르고 돌아온다
{
  const toGather = (stairs: StairsCount) => drive(start(2, ORDERS[0], 'a', stairs), 'gather', 'a', stairs)
  for (const stairs of STAIRS) {
    let g = settle(voteAll(toGather(stairs), 'stairs'))
    assert.equal(g.run.nodeId, 'stairs-vote')
    g = voteAll(g, `s${stairs - 1}`)
    assert.equal(g.run.endingId, 'below-end', `난간 기둥 ${stairs}개 → ${stairs - 1}칸`)
    assert.equal(view(g).ending!.tier, 'neutral')
  }
  let g = voteAll(settle(voteAll(toGather(9), 'stairs')), 's12') // 기둥이 9개인데 열두 칸이라고 답했다
  assert.equal(g.run.nodeId, 'stairs-lost')
  const t0 = g.run.time
  g = ready(g)
  assert.equal(g.run.nodeId, 'gather')
  assert.equal(g.run.time, t0)
  console.log('통과: 계단(하나 적은 칸이 일반 엔딩, 틀리면 대가)')
}

// 9) 서명은 배드 엔딩, 조명이 꺼지면 암전, 모두 정신을 잃으면 정신 상실 — 같은 배드 엔딩이고 본문이 다르다
{
  const sign = voteAll(drive(start(2, ORDERS[0], 'a', 9), 'gather', 'a', 9), 'sign')
  assert.equal(endingOf(sign), 'bad-end')
  assert.match(view(toEnd(sign)).ending!.text, /서명이 수십 줄/)

  // 패스를 계속하면 조명이 꺼진다 (패스마다 하루가 지난다)
  let dark = start(2, ORDERS[0], 'a', 9)
  for (let i = 0; i < 160 && dark.run.phase !== 'ended'; i++) {
    const n = dark.run.nodeId
    if (n === 'arrive') dark = ready(dark)
    else if (n === 'first-look') dark = settle(pickEach(dark, {}, 'desk'))
    else if (n.endsWith('-probe')) dark = pickEach(dark, {}, `${n.split('-')[0]}-wait`)
    else if (n.endsWith('-think')) dark = voteAll(dark, `${n.split('-')[0]}-pass`)
    else if (n.endsWith('-night') && dark.run.phase === 'personal') dark = settle(pickEach(dark, {}, 'rest'))
    else dark = ready(dark)
  }
  assert.equal(dark.run.endingId, 'bad-end')
  assert.equal(dark.run.time, 7, '하루가 일곱 번 지나면(여드레째) 암전')
  assert.match(view(dark).ending!.text, /조명이 완전히 꺼졌다/)

  // 오답을 계속 고르면 정신을 잃는다 (정신력 6, 오답마다 −2)
  let panic = start(2, ORDERS[0], 'a', 9)
  for (const node of ['arrive', 'first-look', 'lift-intro']) panic = node === 'first-look' ? settle(pickEach(panic, {}, 'desk')) : ready(panic)
  for (const wrong of ['press-up', 'press-stuck', 'press-none']) {
    panic = pickEach(panic, {}, 'lift-wait')
    panic = voteAll(voteAll(panic, 'lift-reason'), wrong)
    // 이야기 → 밤(몸을 풀 뿐 정신력은 그대로) → 조사
    if (panic.run.phase !== 'ended') panic = settle(pickEach(settle(panic), {}, 'train-body'))
  }
  assert.equal(panic.run.endingId, 'bad-end')
  assert.match(view(panic).ending!.text, /더는 움직일 수 없었다/)
  console.log('통과: 배드 엔딩의 원인별 본문 (서명·암전·정신 상실)')
}

// 10) 단서는 얻은 사람 이름과 함께 모두에게 보인다
{
  let g = start(2, 'sofa>lift>stairs', 'a', 9)
  for (const node of ['arrive', 'first-look', 'sofa-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'desk')) : ready(g)
  g = pickEach(g, { 0: 'memo-desk', 1: 'memo-book' }, 'sofa-wait')
  const seen = view(g, 'p2').clues.filter((c) => c.id.startsWith('note-')) // 첫 인상에서 얻은 방명록 단서는 뺀다
  assert.deepEqual(seen.map((c) => [c.id, c.by.map((b) => b.id)]), [
    ['note-a-desk', ['p1']],
    ['note-a-book', ['p2']],
  ], '둘 다 상대가 얻은 단서를 이름과 함께 본다')
  assert.deepEqual(view(g, 'p1').board!.questions.find((q) => q.id === 'sofa')!.clues.map((c) => c.id), ['note-a-desk', 'note-a-book'])
  assert.ok(view(g, 'p1').board!.questions.find((q) => q.id === 'sofa')!.current, '지금 과제로 강조된다')
  assert.ok(view(g, 'p1').board!.questions.filter((q) => q.id !== 'sofa').every((q) => q.text === null), '아직 안 한 과제는 숨는다')
  console.log('통과: 단서 공개와 지금 과제 표시')
}

// 11) 오답 뒤의 밤: 과제의 단서·아이템 선택지가 나오고, 얻은 단서는 이름과 함께 공개되며, 아이템은 얻은 사람의 조사를 열어 준다.
//     이미 알아낸 단서의 선택지는 숨고, 문구는 같지만 판마다 하나만 보인다. 과제를 푼 뒤의 밤에는 스텟 선택지뿐이다.
{
  const choiceIds = (g: ScenarioGame, id = 'p1') => view(g, id).scene!.choices.map((c) => c.id)
  const toNight = (order: string, seat: SeatId, stairs: StairsCount, task: (typeof TASKS)[number], wrong: string) => {
    let g = start(2, order, seat, stairs)
    for (const node of ['arrive', 'first-look', `${task}-intro`]) g = node === 'first-look' ? settle(pickEach(g, {}, 'desk')) : ready(g)
    g = voteAll(voteAll(pickEach(g, {}, `${task}-wait`), `${task}-reason`), wrong) // 추리를 시작해 첫 단계에서 틀린다
    g = settle(g)
    assert.equal(g.run.nodeId, `${task}-night`)
    return g
  }

  // 엘리베이터: 한 명은 소리를 듣고(단서), 한 명은 서랍을 뒤져(아이템) 열쇠를 얻는다
  let g = toNight('lift>sofa>stairs', 'b', 11, 'lift', 'press-up')
  g = settle(pickEach(g, { 0: 'listen', 1: 'drawer' }, 'rest'))
  assert.equal(g.run.nodeId, 'lift-probe')
  assert.deepEqual(view(g, 'p2').clues.filter((c) => c.id === 'lift-night-hum').map((c) => c.by.map((b) => b.id)), [['p1']], '밤에 얻은 단서도 이름과 함께 보인다')
  assert.deepEqual(g.run.players.map((p) => p.items), [[], ['key']])
  assert.ok(choiceIds(g, 'p2').includes('panel-open'), '열쇠를 가진 사람에게는 새 조사가 열린다')
  assert.ok(!choiceIds(g, 'p1').includes('panel-open'), '가지지 않은 사람에게는 보이지 않는다')
  // 다음 밤: 이미 알아낸 단서와 가져간 열쇠의 선택지는 숨는다
  g = voteAll(pickEach(g, {}, 'lift-wait'), 'lift-pass')
  g = settle(g)
  assert.deepEqual(choiceIds(g), ['scrawl', 'train-body', 'study', 'rest'])

  // 소파·계단: 문구는 같은 선택지가 판마다 하나만 보인다
  const sf = toNight('sofa>lift>stairs', 'b', 11, 'sofa', 'notes-all')
  assert.deepEqual(choiceIds(sf).filter((x) => x.startsWith('trace-')), ['trace-b'])
  assert.equal(view(sf).scene!.choices.filter((c) => c.text.includes('카펫의 눌린 자국')).length, 1)
  const st = toNight('stairs>lift>sofa', 'a', 13, 'stairs', 'rel-same')
  assert.deepEqual(choiceIds(st).filter((x) => x.startsWith('echo-')), ['echo-13'])
  // 손전등을 얻은 사람은 정확하게 센다
  const lit = settle(pickEach(st, { 0: 'desk' }, 'rest'))
  assert.ok(choiceIds(lit, 'p1').includes('torch') && !choiceIds(lit, 'p2').includes('torch'))
  const counted = settle(pickEach(lit, { 0: 'torch' }, 'stairs-wait'))
  assert.ok(view(counted).clues.some((c) => c.id === 'torch-13'))

  // 과제를 푼 뒤의 밤에는 단서 선택지 없이 스텟 선택지뿐이다
  const solvedNight = drive(start(2, ORDERS[0], 'a', 9), 'night', 'a', 9)
  assert.deepEqual(choiceIds(solvedNight), ['train-body', 'study', 'rest'])
  console.log('통과: 오답 뒤의 밤(단서·아이템·숨김)과 푼 뒤의 스텟 밤')
}

// 12) 성공해도 하루는 지난다: 과제를 풀 때마다 밤이 지나 시계가 흐르고, 2일째·4일째에 조명이 한 번씩 어두워진다
{
  const tasks = ORDERS[0].split('>')
  let g = start(2, ORDERS[0], 'a', 9)
  g = drive(g, `${tasks[0]}-intro`, 'a', 9)
  assert.deepEqual(view(g).timeOfDay, { day: 1, period: 'day' })
  assert.deepEqual(view(g).light, { max: 4, level: 0 })
  assert.equal(view(g).clockLabel, '조명이 환하다')
  g = drive(g, `${tasks[1]}-intro`, 'a', 9) // 첫 과제를 풀고 사건·밤을 지났다
  assert.deepEqual(view(g).timeOfDay, { day: 2, period: 'day' })
  assert.deepEqual(view(g).light, { max: 4, level: 1 }, '틀린 적이 없어도 2일째에 조명이 어두워진다')
  assert.equal(view(g).clockLabel, '조명이 깜빡인다')
  assert.ok(g.run.aftermath.some((c) => c.kind === 'time'), '새 낮이 오면 "하루가 지났다"가 여파로 보인다')
  g = drive(g, `${tasks[2]}-intro`, 'a', 9)
  assert.deepEqual(view(g).timeOfDay, { day: 3, period: 'day' })
  assert.deepEqual(view(g).light, { max: 4, level: 1 }, '3일째에는 그대로다')
  console.log('통과: 성공해도 하루가 지나고 조명은 2일째에 어두워진다')
}

// 13) 사건 순서는 판마다 다르다: events=ph면 전화가 먼저, 발소리가 나중이다. 어느 쪽이든 두 사건을 한 번씩 겪고 같은 진엔딩에 닿는다.
{
  const order = ORDERS[0]
  const g = drive(start(2, order, 'a', 9, { events: 'ph' }), 'night', 'a', 9)
  const v = g.run.visited
  assert.ok(v.indexOf('phone-call') >= 0 && v.indexOf('phone-call') < v.indexOf('night'), '첫 과제 뒤에 전화')
  const end = liftActions(drive(start(2, order, 'a', 9, { events: 'ph' }), 'lift', 'a', 9), 'a', { greet: 'right', lift: 'still' })
  assert.equal(endingOf(end), 'true-end')
  const all = drive(start(2, order, 'a', 9, { events: 'ph' }), 'gather', 'a', 9).run.visited
  assert.ok(all.indexOf('phone-call') < all.indexOf('event-footsteps'), '전화 → 발소리 순서')
  assert.equal(all.filter((x) => x === 'phone-call' || x === 'event-footsteps').length, 2, '두 사건을 한 번씩')
  console.log('통과: 사건 순서가 판마다 다르고 진엔딩은 그대로다')
}

// 14) 위험한 곳: 뽑힌 곳을 살피면 발견은 그대로 얻되 이야기와 대가를 치르고, 다른 곳은 평범하다. 다친 사람은 몸을 쓰는 조사를 못 한다.
{
  // 엘리베이터: 패널이 위험한 곳이면 패널을 읽은 사람만 정신력 −3 (거울은 평범)
  let g = start(2, 'lift>sofa>stairs', 'b', 11, { 'risk-lift': 'panel' })
  for (const node of ['arrive', 'first-look', 'lift-intro']) g = node === 'first-look' ? settle(pickEach(g, {}, 'desk')) : ready(g)
  const s0 = g.run.players.map((p) => p.stats.sanity)
  g = pickEach(g, { 0: 'panel', 1: 'glance' }, 'lift-wait')
  assert.equal(g.run.players[0].stats.sanity, s0[0] - 3, '위험한 곳을 읽은 사람은 정신력을 잃는다')
  assert.equal(g.run.players[1].stats.sanity, s0[1], '평범한 곳은 대가가 없다')
  assert.ok(g.run.players[0].facts.includes('lift-panel-press'), '위험해도 단서는 그대로 얻는다')
  assert.match(view(g, 'p1').result!.mine!.text, /안쪽에서/, '위험한 곳의 이야기가 붙는다')
  assert.doesNotMatch(view(g, 'p2').result!.mine!.text, /안쪽에서/, '평범한 곳에는 붙지 않는다')

  // 소파: 쪽지 틈이 위험한 곳이면 다친다. 다친 사람은 몸을 쓰는 조사(소파 틈·만져 보기)를 못 하지만 읽는 조사는 한다.
  let s = start(2, 'sofa>lift>stairs', 'a', 9, { 'risk-sofa': 'memo-sofa' })
  for (const node of ['arrive', 'first-look', 'sofa-intro']) s = node === 'first-look' ? settle(pickEach(s, {}, 'desk')) : ready(s)
  s = pickEach(s, { 0: 'memo-sofa', 1: 'notice' }, 'sofa-wait')
  assert.deepEqual(s.run.players.map((p) => p.hurt), [true, false])
  assert.ok(s.run.players[0].facts.includes('note-a-sofa'))
  s = settle(s)
  s = voteAll(s, 'sofa-pass') // 패스: 하루가 지나고 밤이 온다
  s = settle(pickEach(settle(s), {}, 'rest')) // 쉬면서 부상이 낫는다
  assert.equal(s.run.nodeId, 'sofa-probe')
  assert.equal(s.run.players[0].hurt, false, '밤에 쉬면 부상이 낫는다')
  console.log('통과: 위험한 곳(대가·이야기·단서는 그대로·부상)')
}

// 15) 위험한 곳은 판마다 다른 조사로 뽑힌다 (시드마다 달라진다) — 과제마다 뽑을 수 있는 조사가 둘 이상이다
{
  const picks = new Set<string>()
  for (let seed = 1; seed <= 40; seed++) {
    const g = createScenarioGame(sc, { seed, players: partyOf(2) })
    picks.add(`${g.run.vars['risk-lift']}|${g.run.vars['risk-sofa']}|${g.run.vars['risk-stairs']}`)
    for (const t of TASKS) assert.ok(typeof g.run.vars[`risk-${t}`] === 'string', `${t}에 위험한 곳이 정해진다`)
  }
  assert.ok(picks.size > 3, '판마다 위험한 곳이 달라진다')
  console.log(`통과: 위험한 곳이 판마다 달라진다 (40판에서 ${picks.size}가지)`)
}

// 16) 추리 사슬: 모든 판에서 단계마다 맞는 보기가 정확히 하나이고, 틀리면 그 시도가 끝나며, 근거 이야기가 단서에 따라 달라진다
{
  const STEPS = { lift: 4, sofa: 4, stairs: 3 } as const
  const text = (g: ScenarioGame) => view(g).scene!.text
  /** 그 과제를 맨 먼저 풀도록 하고, 의도한 풀이로 `<과제>-c<i>` 장면에 선 상태 */
  const atStep = (task: (typeof TASKS)[number], i: number, seat: SeatId, stairs: StairsCount) => {
    const order = [task, ...TASKS.filter((t) => t !== task)].join('>')
    return drive(start(2, order, seat, stairs), `${task}-c${i}`, seat, stairs)
  }

  // (1) 단계마다 보기를 하나씩 모두 골라 보면, 맞는 것은 정확히 하나고 나머지는 이 시도를 끝낸다
  for (const task of TASKS) {
    for (const seat of SEATS) {
      for (const stairs of STAIRS) {
        for (let i = 1; i <= STEPS[task]; i++) {
          const g = atStep(task, i, seat, stairs)
          const options = view(g).scene!.choices.map((c) => c.id)
          assert.ok(options.length >= 2, `${task} ${i}단계: 보기가 둘 이상`)
          const right = options.filter((id) => {
            const r = voteAll(g, id)
            return r.run.nodeId === (i === STEPS[task] ? `${task}-right` : `${task}-c${i}-ok`)
          })
          assert.deepEqual(right, [chainRight(task, seat, stairs)[i - 1]], `${task} ${i}단계 seat=${seat} stairs=${stairs}: 맞는 보기가 하나뿐이다`)
          for (const id of options.filter((x) => !right.includes(x))) {
            assert.match(voteAll(g, id).run.nodeId, new RegExp(`^${task}-c${i}-wrong-${id}-1$`), `${task} ${i}단계 ${id}: 틀리면 그 시도가 끝난다`)
          }
        }
      }
    }
  }

  // (2) 틀리면 오답의 대가와 밤이 이어지고, 조사 선택지가 한 단계 열린다
  {
    const g = atStep('lift', 3, 'a', 9) // 셋째 단계에서 틀린다
    const sanity = g.run.players[0].stats.sanity
    let w = voteAll(g, 'wait-split')
    assert.equal(w.run.nodeId, 'lift-c3-wrong-wait-split-1')
    for (const p of w.run.players) assert.equal(p.stats.sanity, sanity - 2)
    w = settle(w)
    assert.equal(w.run.nodeId, 'lift-night')
    w = settle(pickEach(w, {}, 'rest'))
    assert.equal(w.run.nodeId, 'lift-probe')
    assert.ok(view(w).scene!.choices.some((c) => c.id === 'press'), '틀린 시도 뒤에는 2단계 조사가 열린다')
  }

  // (3) 근거 이야기: 그 단서를 아는 사람이 있으면 단서를 밝히고, 없으면 "감"이라고 한다 (위의 근거가 먼저)
  const okText = (task: (typeof TASKS)[number], i: number, seat: SeatId, stairs: StairsCount, facts: string[]) => {
    const g = structuredClone(atStep(task, i, seat, stairs))
    for (const p of g.run.players) p.facts.push(...facts)
    return text(voteAll(g, chainRight(task, seat, stairs)[i - 1]))
  }
  assert.match(okText('lift', 1, 'a', 9, []), /근거 없이 감이 닿았을 뿐이다/)
  assert.match(okText('lift', 1, 'a', 9, ['lift-panel-press']), /낙서가 근거였다/)
  assert.match(okText('lift', 1, 'a', 9, ['lift-panel-press', 'lift-press-back']), /직접 눌러 본 일이 근거였다/, '직접 해 본 것이 먼저다')
  assert.doesNotMatch(okText('lift', 1, 'a', 9, ['lift-panel-press', 'lift-press-back']), /근거 없이/, '근거가 있으면 감이라고 하지 않는다')
  assert.match(okText('lift', 3, 'a', 9, ['lift-night-scrawl']), /덧쓴 글씨가 근거였다/)
  assert.match(okText('sofa', 2, 'b', 9, ['ink-b']), /잉크가 근거였다/)
  assert.match(okText('sofa', 2, 'b', 9, ['note-b-desk', 'note-b-book', 'note-b-sofa']), /세 쪽지를 나란히 놓고 따져 본 것이 근거였다/)
  assert.match(okText('sofa', 2, 'b', 9, ['note-b-desk']), /근거 없이/, '쪽지 한 장만으로는 근거가 안 된다')
  assert.match(okText('sofa', 3, 'c', 9, ['note-c-book']), /방명록의 마지막 장에 적힌 글이 근거였다/)
  assert.match(okText('sofa', 4, 'b', 9, ['warm-b']), /차례로 만져 본 손이 근거였다/)
  assert.match(okText('sofa', 4, 'c', 9, ['pair-c']), /왼쪽도 가운데도 차가웠으니 남는 곳은 오른쪽/)
  assert.match(okText('stairs', 2, 'a', 9, ['torch-9']), /직접 센 값이 근거였다/)
  assert.match(okText('stairs', 2, 'a', 9, ['feel-low', 'half-odd']), /두 범위를 겹치면 남는 수는 9뿐이다/)
  assert.match(okText('stairs', 2, 'a', 9, ['feel-low']), /근거는 반쪽뿐이다/)
  assert.match(okText('stairs', 2, 'a', 9, []), /근거 없이/)

  // (4) 마지막 단계의 근거는 풀이 앞에 붙고, 앞서 틀려 밝혀진 보기는 질문에 덧붙는다
  {
    const solved = voteAll(atStep('stairs', 3, 'a', 11), 's10')
    assert.equal(solved.run.nodeId, 'stairs-right')
    assert.match(text(solved), /기둥은 11개이니 하나 적게 — 열 칸이다/)
    assert.match(text(solved), /정해 둔 칸까지 내려가자/, '풀이가 이어진다')
    assert.equal(view(solved).scene!.tone, 'success', '맞힌 장면에는 성공 표시가 붙는다')
    const wrong = settle(settle(voteAll(atStep('stairs', 3, 'a', 11), 's12')))
    assert.equal(wrong.run.nodeId, 'stairs-night')
    const again = drive(settle(pickEach(wrong, {}, 'rest')), 'stairs-c3', 'a', 11)
    assert.match(text(again), /이미 아니라고 밝혀졌다: 열둘 칸|이미 아니라고 밝혀졌다: 열두 칸/)
  }
  console.log('통과: 추리 사슬 (모든 판에서 맞는 보기가 하나, 틀리면 시도 종료, 근거 이야기)')
}
