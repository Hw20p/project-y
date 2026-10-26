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

/** 의도한 답의 선택지 id */
function rightAnswer(task: (typeof TASKS)[number], seat: SeatId, stairs: StairsCount): string {
  return task === 'lift' ? 'still' : task === 'sofa' ? `sofa-${seat}` : `s${stairs - 1}`
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
    else if (task && n === `${task}-think`) g = voteAll(g, rightAnswer(task, seat, stairs))
    else if (task) g = ready(g) // 소개·풀렸다
    else if (n === 'event-footsteps') g = voteAll(g, plan.footsteps)
    else if (n === 'phone-call') g = voteAll(g, plan.phone)
    else if (n === 'night') g = settle(pickEach(g, {}, 'train-body'))
    else if (n === 'gather') g = voteAll(g, 'elevator')
    else throw new Error(`예상하지 못한 장면: ${n}`)
  }
  return g
}

const start = (n: number, order: string, seat: SeatId, stairs: StairsCount) =>
  createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { order, seat, stairs } })

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
          assert.equal(g.run.time, 0, '풀기만 하면 조명은 그대로다')
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
  g = voteAll(g, 'once')
  assert.equal(g.run.time, 1, '오답이면 하루가 지난다')
  assert.equal(view(g).clockLabel, '조명이 환하다', '조명은 이틀마다 한 단계 어두워진다 (아직 첫 단계)')
  for (const p of g.run.players) assert.equal(p.stats.sanity, sanity - 2, '정신력도 깎인다')
  // 오답 뒤에는 밤이 온다: 이 과제의 개인 선택지(단서·아이템)와 스텟 선택지가 나온다
  g = settle(g)
  assert.equal(g.run.nodeId, 'lift-night')
  assert.equal(g.run.phase, 'personal')
  assert.deepEqual(view(g).scene!.choices.map((c) => c.id), ['listen', 'scrawl', 'drawer', 'train-body', 'study', 'rest'])
  g = settle(pickEach(g, {}, 'train-body'))
  assert.equal(g.run.nodeId, 'lift-probe', '밤이 끝나면 같은 과제의 조사로 돌아온다')
  assert.deepEqual(view(g).scene!.choices.map((c) => c.id), ['press', 'still', 'pair', 'lift-wait'], '2단계 조사가 열리고 1단계는 이미 살폈다')
  // 패스도 하루를 보내고 밤이 온다. 정신력은 깎지 않는다. 이틀째가 되면 조명이 한 단계 어두워진다.
  g = pickEach(g, {}, 'lift-wait')
  const s2 = g.run.players[0].stats.sanity
  g = voteAll(g, 'lift-pass')
  assert.equal(g.run.time, 2)
  assert.equal(g.run.players[0].stats.sanity, s2, '패스는 정신력을 깎지 않는다')
  assert.equal(view(g).clockLabel, '조명이 깜빡인다')
  assert.deepEqual(view(g).light, { max: 4, level: 1 })
  console.log('통과: 오답·패스의 대가(하루, 이틀에 한 단계 조명)와 밤')
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
  let g = liftActions(lift, seat, { greet: 'right', lift: 'press' })
  assert.equal(g.run.nodeId, 'press-fail')
  assert.equal(g.run.time, 1, '조명이 한 단계 어두워졌다')
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

  // 패스를 계속하면 조명이 꺼진다
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
  assert.equal(dark.run.time, 8, '패스를 여덟 번 하면(여드레째) 암전')
  assert.match(view(dark).ending!.text, /조명이 완전히 꺼졌다/)

  // 오답을 계속 고르면 정신을 잃는다 (정신력 6, 오답마다 −2)
  let panic = start(2, ORDERS[0], 'a', 9)
  for (const node of ['arrive', 'first-look', 'lift-intro']) panic = node === 'first-look' ? settle(pickEach(panic, {}, 'desk')) : ready(panic)
  for (const wrong of ['once', 'mirror', 'top']) {
    panic = pickEach(panic, {}, 'lift-wait')
    panic = voteAll(panic, wrong)
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
    g = voteAll(pickEach(g, {}, `${task}-wait`), wrong)
    g = settle(g)
    assert.equal(g.run.nodeId, `${task}-night`)
    return g
  }

  // 엘리베이터: 한 명은 소리를 듣고(단서), 한 명은 서랍을 뒤져(아이템) 열쇠를 얻는다
  let g = toNight('lift>sofa>stairs', 'b', 11, 'lift', 'once')
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
  const sf = toNight('sofa>lift>stairs', 'b', 11, 'sofa', 'sofa-a')
  assert.deepEqual(choiceIds(sf).filter((x) => x.startsWith('trace-')), ['trace-b'])
  assert.equal(view(sf).scene!.choices.filter((c) => c.text.includes('카펫의 눌린 자국')).length, 1)
  const st = toNight('stairs>lift>sofa', 'a', 13, 'stairs', 's8')
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
