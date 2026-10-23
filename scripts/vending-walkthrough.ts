// A-03 거래하는 자판기(1인용) 공략 시험: 의도한 풀이가 모든 판(받는 것 3 × 버튼 3)에서 진엔딩에 닿는지,
// 조사 보드·생각 정리의 규칙, 모든 엔딩에 닿는 길.
import assert from 'node:assert/strict'
import { vending as sc } from '../src/content/scenarios/vending.ts'
import { createScenarioGame, reduceScenario, type ScenarioAction } from '../src/scenario/game.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import { validateScenario } from '../src/scenario/validate.ts'
import { viewForScenario } from '../src/scenario/view.ts'

const ITEMS = ['coin', 'photo', 'badge'] as const
const BUTTONS = ['A', 'B', 'C'] as const

const act = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(sc, g, a)
const ready = (g: ScenarioGame) => act(g, { type: 'ready', playerId: 'p1' })
/** 읽는 단계(이야기·결과)면 넘긴다 */
const settle = (g: ScenarioGame) => (g.run.phase === 'story' || g.run.phase === 'result' ? ready(g) : g)
/** 선택(개인·조합)하고 결과를 넘긴다 */
const pick = (g: ScenarioGame, actionId: string) => settle(act(g, { type: 'pick', playerId: 'p1', actionId }))
/** 투표(유일한 한 표) — 이야기 장면은 넘기지 않고 멈춘다 */
const voteRaw = (g: ScenarioGame, choiceId: string) => act(g, { type: 'vote', playerId: 'p1', choiceId })
const vote = (g: ScenarioGame, choiceId: string) => settle(voteRaw(g, choiceId))

const mk = (price: string, button: string, archetype = 'researcher') =>
  createScenarioGame(sc, { seed: 1, players: [{ id: 'p1', name: '가', archetype }], vars: { price, button } })
const view = (g: ScenarioGame) => viewForScenario(sc, g, 'p1')
const choiceIds = (g: ScenarioGame) => view(g).scene!.choices.map((c) => c.id)
const sanity = (g: ScenarioGame) => g.run.players[0].stats.sanity

/** 거래까지의 길: 최종 선택(넣을 것·버튼·거스름돈)으로 끝낸다 */
function trade(g: ScenarioGame, item: string, button: string, change: string): ScenarioGame {
  let cur = g
  assert.equal(cur.run.nodeId, 'trade-item')
  cur = vote(cur, `put-${item}`)
  if (cur.run.nodeId !== 'trade-button') return cur
  cur = vote(cur, `press-${button}`)
  if (cur.run.nodeId !== 'trade-change') return cur
  return vote(cur, change)
}

/** 첫 인상 → 조사에서 바로 거래로 (알고 있는 사람의 지름길) */
const toTrade = (g: ScenarioGame) => {
  let cur = settle(g) // 도착
  cur = pick(cur, 'front') // 첫 인상
  assert.equal(cur.run.nodeId, 'patrol')
  cur = pick(cur, 'trade-now')
  assert.equal(cur.run.nodeId, 'trade-item')
  return cur
}

// 0) 정적 검증
{
  const r = validateScenario(sc)
  assert.deepEqual(r.errors, [], r.errors.join('\n'))
  assert.deepEqual(r.warnings, [], r.warnings.join('\n'))
  console.log(`통과: 정적 검증 (장면 ${sc.nodes.length}개, 엔딩 ${sc.nodes.filter((n) => n.kind === 'ending').length}개, 1~8인)`)
}

// 1) 아는 사람의 풀이: 모든 판(9가지)에서 진엔딩
{
  let games = 0
  for (const price of ITEMS) {
    for (const button of BUTTONS) {
      const g = trade(toTrade(mk(price, button)), price, button, 'leave')
      assert.equal(g.run.endingId, 'true-end', `${price}/${button}`)
      assert.equal(view(g).ending!.tier, 'true')
      games++
    }
  }
  console.log(`통과: 아는 사람의 풀이로 진엔딩 (${games}판)`)
}

// 2) 단서를 모아 푸는 길: 관찰 4(연구원)가 투입구·버튼 먼지·낙서·영수증을 살피면 세 의문이 모두 하나로 좁혀진다
{
  for (const price of ITEMS) {
    for (const button of BUTTONS) {
      let g = settle(mk(price, button))
      g = pick(g, 'front')
      const hold = (x: ScenarioGame) => (x.run.nodeId === 'think' ? vote(x, 'hold') : x)
      const events = (x: ScenarioGame) => {
        if (x.run.nodeId === 'event-hum') return vote(x, 'ignore')
        if (x.run.nodeId === 'event-voice') return vote(x, 'honest')
        return x
      }
      for (const spot of ['slot', 'dust', 'graffiti', 'receipt']) {
        assert.equal(g.run.nodeId, 'patrol', `${spot} 전에 조사 장면`)
        g = events(hold(pick(g, spot)))
        g = events(g)
      }
      // 이제 보드에는 세 의문의 후보가 모두 하나로 좁혀져 있다
      assert.equal(g.run.nodeId, 'gather', `${price}/${button}: 네 곳을 살폈으면 마지막 결정`)
      const qs = view(g).board!.questions
      const idsOf = (i: number) => qs[i].clues.map((c) => c.id).sort()
      assert.deepEqual(idsOf(0), ['machine-sums', ...ITEMS.filter((i) => i !== price).map((i) => `no-item-${i}`)].sort())
      assert.deepEqual(idsOf(1), BUTTONS.filter((b) => b !== button).map((b) => `no-btn-${b}`).sort())
      assert.deepEqual(idsOf(2), ['change-debt', 'change-restart'])
      g = vote(g, 'trade')
      g = trade(g, price, button, 'leave')
      assert.equal(g.run.endingId, 'true-end')
    }
  }
  console.log('통과: 단서를 모아 푸는 길 (후보가 하나로 좁혀지고 진엔딩)')
}

// 3) 관찰이 낮으면 한 곳에서 후보 하나만 지운다 (칸이 모자라 어딘가는 답을 걸어야 한다)
{
  let g = pick(settle(mk('photo', 'B', 'rookie')), 'front')
  g = pick(g, 'slot') // 투입구: 사진이 받는 것이면 배지 후보 하나만 지운다
  const clues = view(g).board!.questions[0].clues.map((c) => c.id).sort()
  assert.deepEqual(clues, ['machine-sums', 'no-item-badge'], '관찰이 낮으면 한 후보만')
  const sharp = pick(pick(settle(mk('photo', 'B', 'researcher')), 'front'), 'slot')
  assert.deepEqual(view(sharp).board!.questions[0].clues.map((c) => c.id).sort(), ['machine-sums', 'no-item-badge', 'no-item-coin'], '관찰 3 이상이면 두 후보')
  // 한 곳은 한 번만
  const again = pick(g, 'patrol-none-existing')
  assert.equal(again.run.nodeId, g.run.nodeId)
  console.log('통과: 관찰에 따라 단서가 달라진다')
}

// 4) 생각 정리: 답을 걸면 시험해 보고, 틀리면 마음이 크게 흔들리며 그 답이 지워진다
{
  let g = pick(settle(mk('coin', 'C')), 'front')
  g = pick(g, 'slot')
  assert.equal(g.run.nodeId, 'think', '아는 것이 생기면 생각을 정리한다')
  assert.deepEqual(choiceIds(g), ['item-coin', 'item-photo', 'item-badge', 'hold', 'trade-start'], '답은 단서가 아니라 걸어 본 결과로만 지워진다')
  const s0 = sanity(g)
  const wrong = voteRaw(g, 'item-badge')
  assert.equal(wrong.run.nodeId, 'item-wrong-badge')
  assert.equal(sanity(wrong), s0 - 2, '틀리면 정신력 −2')
  assert.ok(wrong.run.flags.includes('ng-item-badge'))
  const right = voteRaw(g, 'item-coin')
  assert.equal(right.run.nodeId, 'item-right')
  assert.equal(sanity(right), s0, '맞으면 대가가 없다')
  const q = view(right).board!.questions[0]
  assert.equal(q.solved, true)
  assert.equal(q.answer, '낡은 동전이다.')
  console.log('통과: 생각 정리(답 걸기·대가·확정)')
}

// 5) 모든 엔딩에 닿는 길
{
  const base = (price: string, button: string) => toTrade(mk(price, button))
  const end = (g: ScenarioGame) => g.run.endingId
  assert.equal(end(trade(base('coin', 'A'), 'photo', 'A', 'leave')), 'erased-end', '틀린 품목')
  assert.equal(end(trade(base('coin', 'A'), 'coin', 'B', 'leave')), 'slot-end', '틀린 버튼')
  assert.equal(end(trade(base('coin', 'A'), 'coin', 'A', 'take')), 'debt-end', '거스름돈을 챙김')
  assert.equal(end(trade(base('coin', 'A'), 'coin', 'A', 'again')), 'greedy-end', '거스름돈을 도로 넣음')
  assert.equal(end(trade(base('coin', 'A'), 'coin', 'A', 'leave')), 'true-end')
  // 거래 직전에 되돌아와 더 조사할 수 있다
  const back = vote(base('coin', 'A'), 'back')
  assert.equal(back.run.nodeId, 'patrol')

  // 기다리기: 정직하게 답했으면 조용한 아침, 아니면 정산
  const play = (voiceChoice: string) => {
    let g = pick(settle(mk('coin', 'A')), 'front')
    for (let i = 0; i < 40 && g.run.nodeId !== 'gather' && !g.run.endingId; i++) {
      const n = g.run.nodeId
      if (n === 'patrol') g = pick(g, 'coffee')
      else if (n === 'event-hum') g = vote(g, 'ignore')
      else if (n === 'event-voice') g = vote(g, voiceChoice)
      else if (n === 'think') g = vote(g, 'hold')
      else g = settle(g)
    }
    assert.equal(g.run.nodeId, 'gather')
    return g
  }
  assert.equal(end(vote(play('honest'), 'wait')), 'quiet-end')
  assert.equal(end(vote(play('lie'), 'wait')), 'dawn-end')
  assert.equal(end(vote(play('silent'), 'wait')), 'dawn-end')
  // 시간이 없는데 더 살피면 동이 튼다
  let more = vote(play('honest'), 'more')
  assert.equal(more.run.endingId, 'dawn-end', '시계가 5가 되어 정산')

  // 정신을 모두 잃으면
  let c = toTrade(mk('coin', 'A'))
  c = structuredClone(c)
  c.run.players[0].stats.sanity = 0
  c = settle(act(c, { type: 'force' }))
  assert.equal(c.run.endingId, 'collapse-end')
  console.log('통과: 모든 엔딩(진엔딩·조용한 아침·엉뚱한 칸·지워진 것·빚·다시 처음부터·정산·정신 상실)')
}

// 6) 사건: 소리는 정신력을 깎는 대신 정산 규칙을 알려 주고, 목소리에 거짓으로 답하면 정신력이 깎인다
{
  let g = pick(settle(mk('coin', 'A')), 'front')
  g = pick(g, 'coffee')
  assert.equal(g.run.nodeId, 'think', '첫 인상에서 아는 것이 있어서 생각 정리가 먼저 열린다')
  g = vote(g, 'hold')
  assert.equal(g.run.nodeId, 'event-hum')
  const heard = vote(g, 'listen')
  assert.ok(heard.run.players[0].facts.includes('dawn-collect'))
  const unplugged = vote(g, 'unplug')
  assert.equal(unplugged.run.time, g.run.time + 1, '코드를 뽑으면 시간이 흐른다')
  console.log('통과: 사건(혼자 울리는 소리)')
}

// 7) 여럿이서: 인원이 많을수록 조사 라운드가 줄고(1명 4 · 2명 3 · 3~4명 2 · 5명 이상 1), 모두 진엔딩에 닿을 수 있다
{
  const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, archetype: 'researcher' }))
  const each = (g: ScenarioGame, make: (id: string) => ScenarioAction) => g.run.players.reduce((cur, p) => act(cur, make(p.id)), g)
  const readyAll = (g: ScenarioGame) => each(g, (id) => ({ type: 'ready', playerId: id }))
  const settleAll = (g: ScenarioGame) => (g.run.phase === 'story' || g.run.phase === 'result' ? readyAll(g) : g)
  const voteAll = (g: ScenarioGame, choiceId: string) => settleAll(each(g, (id) => ({ type: 'vote', playerId: id, choiceId })))
  const pickAll = (g: ScenarioGame, actionId: string) => settleAll(each(g, (id) => ({ type: 'pick', playerId: id, actionId })))

  const expectedRounds = (n: number) => (n === 1 ? 4 : n === 2 ? 3 : n <= 4 ? 2 : 1)
  for (const n of [1, 2, 3, 4, 5, 8]) {
    for (const [price, button] of [['coin', 'A'], ['photo', 'B'], ['badge', 'C']] as const) {
      let g = createScenarioGame(sc, { seed: 1, players: players(n), vars: { price, button } })
      g = pickAll(settleAll(g), 'front')
      for (let i = 0; i < 40 && g.run.nodeId !== 'gather'; i++) {
        const node = g.run.nodeId
        if (node === 'patrol') g = pickAll(g, 'coffee')
        else if (node === 'think') g = voteAll(g, 'hold')
        else if (node === 'event-hum') g = voteAll(g, 'ignore')
        else if (node === 'event-voice') g = voteAll(g, 'honest')
        else g = settleAll(g)
      }
      assert.equal(g.run.nodeId, 'gather', `${n}명`)
      assert.equal(g.run.visited.filter((v) => v === 'patrol').length, expectedRounds(n), `${n}명의 조사 라운드`)
      assert.ok(g.run.flags.includes('honest'), `${n}명도 목소리 사건을 거친다`)
      g = voteAll(g, 'trade')
      g = voteAll(g, `put-${price}`)
      g = voteAll(g, `press-${button}`)
      g = voteAll(g, 'leave')
      assert.equal(g.run.endingId, 'true-end', `${n}명 ${price}/${button}`)
    }
  }
  // 여럿이면 "지금 거래한다"는 조사 행동으로 없다 (생각 정리나 마지막 결정에서 거래한다)
  const group = pickAll(settleAll(createScenarioGame(sc, { seed: 1, players: players(2), vars: { price: 'coin', button: 'A' } })), 'front')
  assert.ok(!viewForScenario(sc, group, 'p1').scene!.choices.some((c) => c.id === 'trade-now'))
  assert.ok(viewForScenario(sc, createScenarioGame(sc, { seed: 1, players: players(1) }), 'p1') !== null)
  console.log('통과: 여럿이서 (라운드 수는 인원에 따라 1·2·3·4번, 모두 진엔딩)')
}
