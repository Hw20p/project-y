// 시나리오 엔진 스모크 테스트 2: 스텟(기준선)·개인 장면·정신을 잃음. (`smoke.ts`는 투표·분할 장면·부상·마감)
import assert from 'node:assert/strict'
import { createScenarioGame, currentNode, openVoteChoices, reduceScenario, type ScenarioAction } from '../src/scenario/game.ts'
import { night } from '../src/scenario/fixtures/night.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import { ARCHETYPES } from '../src/scenario/stats.ts'
import { validateArchetypes, validateScenario } from '../src/scenario/validate.ts'
import { viewForScenario } from '../src/scenario/view.ts'

const act = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(night, g, a)
const readyAll = (g: ScenarioGame, ids: string[]) => ids.reduce((s, id) => act(s, { type: 'ready', playerId: id }), g)
const crew = [
  { id: 'a', name: '가', archetype: 'office' }, // 체력 2, 관찰 3
  { id: 'b', name: '나', archetype: 'researcher' }, // 관찰 4
]
/** 시작 이야기를 넘겨 밤(개인 장면)으로 */
const startNight = (players = crew, seed = 1) =>
  readyAll(createScenarioGame(night, { seed, players }), players.map((p) => p.id))

// 1) 입사 배경과 시나리오 검증
{
  assert.deepEqual(validateArchetypes(ARCHETYPES), [])
  const bad = structuredClone(ARCHETYPES)
  bad[1].stats.body = 5
  assert.match(validateArchetypes(bad).join('\n'), /합이 다른/)
  const rpt = validateScenario(night)
  assert.deepEqual(rpt.errors, [], rpt.errors.join('\n'))
  assert.deepEqual(rpt.warnings, [], rpt.warnings.join('\n'))

  const g = createScenarioGame(night, { seed: 1, players: [...crew, { id: 'c', name: '다', archetype: '없는배경' }] })
  assert.deepEqual(g.run.players[0].stats, { sanity: 6, body: 2, insight: 3 })
  assert.deepEqual(g.run.players[1].stats, { sanity: 6, body: 1, insight: 4 })
  assert.equal(g.run.players[2].archetype, 'rookie', '모르는 배경은 신입')
  const v = viewForScenario(night, g, 'a')
  assert.deepEqual(v.players[1].stats, g.run.players[1].stats, '파티원의 스텟이 모두에게 보인다')
  assert.equal(v.players[1].archetype, 'researcher')

  const broken = structuredClone(night)
  const nn = broken.nodes.find((n) => n.id === 'night')
  if (nn?.kind !== 'personal') throw new Error('night')
  nn.options[3].then = '없는단계'
  nn.steps![1].then = 'cellar-1' // 원을 그린다
  const errs = validateScenario(broken).errors.join('\n')
  assert.match(errs, /없는 개인 단계 "없는단계"/)
  assert.match(errs, /원을 그리며/)
  console.log('통과: 입사 배경·스텟·개인 장면 검증')
}

// 2) 개인 장면: 모두 고를 때까지는 바꾸거나 취소할 수 있고, 모두 고르면 각자에게 적용된다. 누가 뭘 골랐는지는 보인다. 기준선(체력)으로 열리는 선택지.
{
  let g = startNight()
  assert.equal(g.run.phase, 'personal')
  const va = viewForScenario(night, g, 'a')
  assert.equal(va.scene!.kind, 'personal')
  // 체력 기준선: 사무직(체력 2)은 서랍을 열 수 있고, 연구원(체력 1)은 잠긴 문구만 본다
  assert.equal(va.scene!.choices.find((c) => c.id === 'drawer')!.locked, undefined)
  assert.equal(
    viewForScenario(night, g, 'b').scene!.choices.find((c) => c.id === 'drawer')!.locked,
    '서랍이 뻑뻑하다. 힘이 있어야 열 수 있을 것 같다',
  )
  assert.equal(act(g, { type: 'pick', playerId: 'b', actionId: 'drawer' }), g, '기준에 못 미치면 고를 수 없다')

  // a가 훈련을 골라도 아직 아무것도 적용되지 않는다. b의 화면에는 누가 골랐는지만 보인다.
  g = act(g, { type: 'pick', playerId: 'a', actionId: 'train' })
  assert.equal(g.run.players[0].stats.body, 2, '모두 고르기 전에는 적용되지 않는다')
  assert.deepEqual(viewForScenario(night, g, 'b').scene!.choices.find((c) => c.id === 'train')!.pickerIds, ['a'])
  assert.equal(viewForScenario(night, g, 'b').players[0].progress, 'picked')
  assert.equal(viewForScenario(night, g, 'a').scene!.myLines.length, 0, '결과 글도 아직 없다')
  assert.equal(g.run.phase, 'personal', 'b가 아직 안 골랐다')

  // 바꾸고, 취소하고, 다시 고를 수 있다
  g = act(g, { type: 'pick', playerId: 'a', actionId: 'rest' })
  assert.equal(viewForScenario(night, g, 'a').scene!.myChoiceId, 'rest')
  assert.deepEqual(viewForScenario(night, g, 'b').scene!.choices.find((c) => c.id === 'train')!.pickerIds, [])
  assert.equal(g.run.players[0].stats.sanity, 6, '고쳐 고른 것도 아직 적용되지 않는다')
  g = act(g, { type: 'cancel', playerId: 'a' })
  assert.equal(viewForScenario(night, g, 'a').scene!.myChoiceId, null)
  assert.equal(viewForScenario(night, g, 'b').players[0].progress, 'choosing')
  assert.equal(act(g, { type: 'cancel', playerId: 'a' }), g, '거둘 것이 없으면 아무 일도 없다')
  g = act(g, { type: 'pick', playerId: 'a', actionId: 'train' })

  // 마지막 사람이 고르면 한꺼번에 적용된다
  g = act(g, { type: 'pick', playerId: 'b', actionId: 'train' })
  assert.equal(g.run.players[0].stats.body, 3)
  assert.equal(g.run.players[1].stats.body, 2)
  assert.equal(g.run.phase, 'result')
  assert.equal(act(g, { type: 'cancel', playerId: 'a' }), g, '적용된 뒤에는 거둘 수 없다')

  // 강제 진행: 안 고른 사람을 기다리지 않고, 이미 고른 것만 적용한다
  let f = startNight()
  f = act(f, { type: 'pick', playerId: 'a', actionId: 'train' })
  f = act(f, { type: 'force' })
  assert.equal(f.run.players[0].stats.body, 3, '고른 것은 적용된다')
  assert.equal(f.run.players[1].stats.body, 1, '안 고른 사람은 아무것도 하지 않는다')
  console.log('통과: 개인 장면(모두 고른 뒤 적용·선택 공개·취소·스텟 기준선)')
}

// 3) 개인 단계: 고른 뒤 혼자 이어지는 장면. 단서는 본인만 얻고 결과는 본인에게만 보인다.
{
  let g = startNight()
  g = act(g, { type: 'pick', playerId: 'a', actionId: 'drawer' })
  assert.ok(!g.run.players[0].items.includes('lamp'), '모두 고르기 전에는 얻지 못한다')
  g = act(g, { type: 'pick', playerId: 'b', actionId: 'cellar' })
  assert.ok(g.run.players[0].items.includes('lamp'))
  assert.equal(g.run.players[1].stats.sanity, 5)
  const vb = viewForScenario(night, g, 'b')
  assert.equal(vb.players[1].progress, 'solo')
  assert.match(vb.scene!.solo!.text, /물 떨어지는/)
  assert.deepEqual(vb.scene!.solo!.aftermath, [{ kind: 'stat', playerId: 'b', stat: 'sanity', amount: -1 }], '미뤄 둔 효과는 다음 단계에 들어오며 여파로 적용된다')
  assert.deepEqual(viewForScenario(night, g, 'a').scene!.solo, null)
  assert.equal(viewForScenario(night, g, 'a').scene!.solo, null, '남의 개인 단계는 안 보인다')
  assert.equal(viewForScenario(night, g, 'a').players[1].progress, 'solo', '혼자 진행 중이라는 것만 안다')

  // 기준선: 관찰 4인 b는 귀를 기울일 수 있다
  assert.equal(vb.scene!.solo!.choices.find((c) => c.id === 'listen')!.locked, undefined)
  assert.equal(act(g, { type: 'ready', playerId: 'b' }), g, '선택해야 하는 단계는 계속으로 넘어갈 수 없다')
  g = act(g, { type: 'solo', playerId: 'b', choiceId: 'listen' })
  assert.deepEqual(g.run.players[1].facts, ['drip', 'mark'], '다음 단계에 들어오는 순간 그 단계의 효과(표식 발견)가 적용된다')
  assert.equal(g.run.phase, 'personal')
  // 선택이 없는 단계는 읽고 계속
  assert.equal(viewForScenario(night, g, 'b').scene!.solo!.choices.length, 0)
  g = act(g, { type: 'ready', playerId: 'b' })
  assert.equal(g.run.phase, 'result')
  assert.deepEqual(g.run.players[0].facts, [])

  // 결과: 각자 자기 글만, 스텟 변화는 모두에게
  const ra = viewForScenario(night, g, 'a').result!
  const rb = viewForScenario(night, g, 'b').result!
  assert.equal(ra.kind, 'personal')
  assert.match(ra.mine!.text, /손전등/)
  assert.match(rb.mine!.text, /물소리는 일정한 박자/)
  assert.ok(!JSON.stringify(ra).includes('물소리'), '남의 개인 기록은 전달되지 않는다')
  assert.ok(ra.changes.some((c) => c.kind === 'stat' && c.playerId === 'b' && c.amount === -1), '남의 정신력 변화는 모두에게 보인다')
  assert.deepEqual(ra.picks, { a: 'drawer', b: 'cellar' }, '누가 무엇을 골랐는지는 결과에도 남는다')
  g = readyAll(g, ['a', 'b'])
  assert.equal(g.run.nodeId, 'day')
  console.log('통과: 개인 단계(혼자 이어지는 장면·비공개 기록)')
}

// 4) 정신을 잃음: 투표에서 빠지고, 개인 장면에서는 진정시키는 선택지만 고를 수 있다. 회복하면 돌아온다.
{
  let g = structuredClone(startNight())
  g.run.players[0].stats.sanity = 0 // a가 정신을 잃었다
  const va = viewForScenario(night, g, 'a')
  assert.equal(va.me.panic, true)
  assert.equal(viewForScenario(night, g, 'b').players[0].panic, true)
  assert.equal(va.scene!.choices.find((c) => c.id === 'train')!.locked, '정신을 잃어 할 수 없다')
  assert.equal(act(g, { type: 'pick', playerId: 'a', actionId: 'train' }), g)
  g = act(g, { type: 'pick', playerId: 'a', actionId: 'rest' })
  g = act(g, { type: 'pick', playerId: 'b', actionId: 'train' })
  assert.equal(g.run.players[0].stats.sanity, 4, '진정시키는 선택지로 회복한다')
  assert.equal(viewForScenario(night, g, 'a').me.panic, false)

  // 투표: 정신을 잃은 사람은 빠지고 나머지가 고르면 진행한다
  let v = startNight()
  v = act(act(v, { type: 'pick', playerId: 'a', actionId: 'train' }), { type: 'pick', playerId: 'b', actionId: 'train' })
  v = readyAll(v, ['a', 'b'])
  assert.equal(v.run.nodeId, 'day')
  // 투표도 모두 고르기 전에는 거둘 수 있다
  const withVote = act(v, { type: 'vote', playerId: 'a', choiceId: 'wait' })
  assert.equal(withVote.run.votes.a, 'wait')
  assert.equal(act(withVote, { type: 'cancel', playerId: 'a' }).run.votes.a, undefined)
  v = structuredClone(v)
  v.run.players[0].stats.sanity = 0
  assert.equal(act(v, { type: 'vote', playerId: 'a', choiceId: 'wait' }), v, '정신을 잃은 사람은 투표할 수 없다')
  assert.equal(viewForScenario(night, v, 'b').players[0].acted, true, '빠진 사람은 기다리는 사람으로 세지 않는다')
  v = act(v, { type: 'vote', playerId: 'b', choiceId: 'wait' })
  assert.equal(v.run.endingId, 'quiet', '남은 사람이 다 골랐으니 진행')

  // 전원이 정신을 잃은 채 다음 장면으로 가면 정신 상실 엔딩
  let wipe = structuredClone(startNight())
  wipe.run.players.forEach((p) => (p.stats.sanity = 0))
  assert.equal(act(wipe, { type: 'pick', playerId: 'a', actionId: 'train' }), wipe, '정신을 잃으면 일반 선택지는 무시')
  wipe = act(wipe, { type: 'force' }) // 진정시키지 않고 넘긴다 (보여 줄 결과가 없으면 곧바로 다음 장면으로)
  assert.equal(wipe.run.endingId, 'collapse', '전원이 정신을 잃은 채면 정신 상실 엔딩')

  // 정신력을 깎는 선택(전원 −3)은 고른 직후가 아니라 **다음 장면**에서 적용된다 (여파)
  let delay = startNight()
  delay = act(act(delay, { type: 'pick', playerId: 'a', actionId: 'train' }), { type: 'pick', playerId: 'b', actionId: 'train' })
  delay = readyAll(delay, ['a', 'b'])
  assert.equal(delay.run.nodeId, 'day')
  delay = act(act(delay, { type: 'vote', playerId: 'a', choiceId: 'push' }), { type: 'vote', playerId: 'b', choiceId: 'push' })
  assert.equal(delay.run.phase, 'result')
  assert.deepEqual(delay.run.players.map((p) => p.stats.sanity), [6, 6], '고른 직후에는 정신력이 그대로다')
  assert.equal(viewForScenario(night, delay, 'a').result!.changes.some((c) => c.kind === 'stat'), false, '결과 화면에도 대가는 안 보인다')
  delay = readyAll(delay, ['a', 'b'])
  assert.equal(delay.run.nodeId, 'corridor')
  assert.deepEqual(delay.run.players.map((p) => p.stats.sanity), [3, 3], '다음 장면에 들어오며 적용된다')
  const after = viewForScenario(night, delay, 'b').aftermath
  assert.deepEqual(
    after.filter((c) => c.kind === 'stat').map((c) => (c.kind === 'stat' ? [c.playerId, c.amount] : null)),
    [['a', -3], ['b', -3]],
    '여파로 화면에 보인다',
  )
  assert.equal(delay.run.pending.length, 0)
  delay = readyAll(delay, ['a', 'b'])
  assert.equal(delay.run.aftermath.length, 0, '여파는 그 장면에서만 보인다')

  // 이미 정신력이 낮아서 대가로 0이 되면 → 다음 장면에서 전원 정신을 잃고 정신 상실 엔딩
  let push = startNight()
  push = act(act(push, { type: 'pick', playerId: 'a', actionId: 'cellar' }), { type: 'pick', playerId: 'b', actionId: 'cellar' })
  push = act(act(push, { type: 'solo', playerId: 'a', choiceId: 'press' }), { type: 'solo', playerId: 'b', choiceId: 'press' })
  assert.equal(push.run.players[0].stats.sanity, 2)
  push = readyAll(readyAll(push, ['a', 'b']), ['a', 'b']) // 단계 끝(cellar-2) → 결과 → 낮
  assert.equal(push.run.phase, 'vote')
  push = act(act(push, { type: 'vote', playerId: 'a', choiceId: 'push' }), { type: 'vote', playerId: 'b', choiceId: 'push' })
  assert.equal(push.run.players[0].stats.sanity, 2, '대가는 아직 적용되지 않았다')
  push = readyAll(push, ['a', 'b'])
  assert.equal(push.run.endingId, 'collapse', '대가로 전원 정신을 잃어 정신 상실 엔딩')
  assert.ok(
    viewForScenario(night, push, 'a').aftermath.some((c) => c.kind === 'stat' && c.playerId === 'a' && c.amount === -2),
    '엔딩으로 넘어가도 여파는 남는다',
  )
  console.log('통과: 정신 상실(투표 제외·진정 선택지·전원 정신 상실 엔딩)')
}

// 5) 단계 도중에 정신을 잃어 고를 게 없어지면 그 사람만 거기서 끝나고 모두가 기다리지 않는다
{
  const three = [...crew, { id: 'c', name: '다', archetype: 'field' }]
  let g = startNight(three)
  g = act(g, { type: 'pick', playerId: 'a', actionId: 'train' })
  g = act(g, { type: 'pick', playerId: 'b', actionId: 'cellar' })
  g = structuredClone(g)
  g.run.players[1].stats.sanity = 0 // 내려간 b가 (다른 이유로) 정신을 잃었다
  assert.equal(act(g, { type: 'solo', playerId: 'b', choiceId: 'back' }), g, '정신을 잃은 사람은 일반 선택지를 못 고른다')
  // 마지막 사람이 행동하면 b의 막힌 진행이 정리되고 장면이 끝난다
  g = act(g, { type: 'pick', playerId: 'c', actionId: 'train' })
  assert.equal(g.run.phase, 'result', 'b를 기다리며 멈추지 않는다')
  assert.match(viewForScenario(night, g, 'b').result!.mine!.text, /정신을 잃어 더는 움직이지 못했다/)
  console.log('통과: 개인 단계 도중 정신 상실 처리')
}

// 6) 다시 도전: 입사 배경은 유지되고 스텟은 처음으로
{
  let g = startNight()
  g = act(act(g, { type: 'pick', playerId: 'a', actionId: 'train' }), { type: 'pick', playerId: 'b', actionId: 'train' })
  g = readyAll(g, ['a', 'b'])
  g = act(act(g, { type: 'vote', playerId: 'a', choiceId: 'wait' }), { type: 'vote', playerId: 'b', choiceId: 'wait' })
  assert.equal(g.run.phase, 'ended')
  const again = act(g, { type: 'retry' })
  assert.deepEqual(again.run.players.map((p) => p.archetype), ['office', 'researcher'])
  assert.deepEqual(again.run.players[0].stats, { sanity: 6, body: 2, insight: 3 }, '스텟은 처음으로')
  console.log('통과: 다시 도전(배경 유지·스텟 초기화)')
}

// 7) 무작위로 눌러도 끝난다 (개인 장면·정신 상실 포함, 1~4명, 입사 배경 섞기)
{
  const endings = new Map<string, number>()
  for (let seed = 1; seed <= 400; seed++) {
    const n = 1 + (seed % 4)
    const roster = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      archetype: ARCHETYPES[(seed + i) % ARCHETYPES.length].id,
    }))
    let g = createScenarioGame(night, { seed, players: roster })
    let steps = 0
    let r = seed * 2654435761
    const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296)
    while (g.run.phase !== 'ended' && steps++ < 600) {
      const node = currentNode(night, g)
      const p = roster[Math.floor(rnd() * n)]
      let a: ScenarioAction
      if (g.run.phase === 'story' || g.run.phase === 'result') a = { type: 'ready', playerId: p.id }
      else if (node.kind === 'vote') {
        const open = openVoteChoices(g, node)
        a = { type: 'vote', playerId: p.id, choiceId: open[Math.floor(rnd() * open.length)].id }
      } else if (node.kind === 'personal') {
        const prog = g.run.personal[p.id]
        if (prog?.step) {
          const step = node.steps!.find((s) => s.id === prog.step)!
          a = step.choices?.length
            ? { type: 'solo', playerId: p.id, choiceId: step.choices[Math.floor(rnd() * step.choices.length)].id }
            : { type: 'ready', playerId: p.id }
        } else {
          a = { type: 'pick', playerId: p.id, actionId: node.options[Math.floor(rnd() * node.options.length)].id }
        }
      } else break
      g = act(g, a)
      if (steps % 41 === 0 && g.run.phase !== 'ended') g = act(g, { type: 'force' })
    }
    assert.equal(g.run.phase, 'ended', `시드 ${seed}(${n}명)가 ${steps}번 안에 끝나지 않음`)
    endings.set(g.run.endingId!, (endings.get(g.run.endingId!) ?? 0) + 1)
  }
  console.log(`통과: 개인 장면 무작위 400판 모두 종료 (${[...endings].map(([k, v]) => `${k} ${v}`).join(', ')})`)
}
