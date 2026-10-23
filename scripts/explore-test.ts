// 전수 탐색기 테스트: 알려진 시나리오에서 정확한 결과를 내는지, 망가진 시나리오의 문제를 잡는지.
import assert from 'node:assert/strict'
import { Explorer, exploreScenario } from '../src/scenario/explore.ts'
import { demo } from '../src/scenario/fixtures/demo.ts'
import { night } from '../src/scenario/fixtures/night.ts'
import { partyOf } from '../src/scenario/registry.ts'
import type { Scenario } from '../src/scenario/types.ts'
import { validateScenario } from '../src/scenario/validate.ts'

// 1) 시험용 건물: 모든 엔딩에 닿고, 갇히는 곳이 없다. 무작위 값 3가지 모두에서 진엔딩에 닿는다.
{
  const r = exploreScenario(demo, { players: partyOf(2), strategy: 'bfs' })
  assert.equal(r.combos, 3)
  assert.equal(r.truncated, false)
  const by = Object.fromEntries(r.endings.map((e) => [e.id, e]))
  assert.deepEqual(Object.keys(by).sort(), ['good', 'late', 'side', 'wiped'])
  for (const e of r.endings) assert.ok(e.reachableCombos > 0, `${e.id}에 닿을 수 있다`)
  assert.equal(by.good.reachableCombos, 3, '어떤 암호가 뽑혀도 진엔딩이 가능하다')
  assert.equal(r.deadEnds.length, 0)
  assert.equal(r.stuck.length, 0)
  assert.deepEqual(r.unvisitedNodes, [])
  // 시험용 시나리오는 구급 상자(kit)를 어디서도 주지 않아서 "쉰다"는 고를 수 없다 — 탐색기가 정확히 그것만 알려 준다
  assert.deepEqual(r.untakenChoices, ['hub.rest'])

  // 최단 경로: 입구 계속 → (메모 읽기 + 뒤지기) → 결과 계속 → 그 판의 암호
  const path = by.good.shortest!.steps
  assert.equal(path.length, 4)
  assert.ok(path[path.length - 1].label.includes(String(by.good.shortest!.combo.code)), '마지막 걸음은 그 판의 암호를 말하는 것이다')
  assert.ok(path.some((p) => /메모를 읽는다/.test(p.label)), '메모를 읽는 걸음이 길에 들어 있다')
  assert.equal(by.wiped.shortest!.steps.length, 3, '전원 부상이 가장 빨리 온다')
  assert.ok(by.late.shortest!.steps.length > path.length, '마감 엔딩은 틀린 암호를 두 번 말해야 한다')

  // 장면 그래프: 시작 → 허브 → 문 …
  const edge = (a: string, b: string) => r.graph.edges.find((e) => e.from === a && e.to === b)
  assert.ok(edge('start', 'hub'))
  assert.ok(edge('hub', 'door'))
  assert.ok(edge('door', 'good'))
  assert.ok(edge('door', 'trap'))
  assert.ok(edge('hub', 'wiped'), '전원 부상으로 가는 길도 보인다')
  console.log(`통과: 시험용 건물 전수 탐색 (상태 ${r.states}개, 진엔딩 최단 ${path.length}걸음)`)
}

// 2) 시험용 밤: 개인 장면·정신 상실을 포함해 모든 엔딩에 닿는다 (3명)
{
  const r = exploreScenario(night, { players: partyOf(3) })
  assert.equal(r.truncated, false)
  assert.deepEqual(r.endings.map((e) => e.reachableCombos > 0), r.endings.map(() => true))
  assert.equal(r.deadEnds.length, 0)
  assert.equal(r.stuck.length, 0)
  assert.deepEqual(r.untakenChoices, [], r.untakenChoices.join(', '))
  const collapse = r.endings.find((e) => e.id === 'collapse')!
  assert.ok(collapse.shortest!.steps.length > 3)
  console.log(`통과: 시험용 밤 전수 탐색 (3명, 상태 ${r.states}개)`)
}

// 3) 정적 검증을 통과해도 실제로는 닿을 수 없는 엔딩을 잡는다 (열쇠를 주는 곳이 없어졌다)
{
  const broken = structuredClone(demo) as Scenario
  const hub = broken.nodes.find((n) => n.id === 'hub')
  if (hub?.kind !== 'split') throw new Error('hub')
  for (const f of hub.private ?? []) f.effects = f.effects?.filter((e) => !('give' in e))
  const stat = validateScenario(broken)
  assert.deepEqual(stat.errors, [], '정적 검증은 이 문제를 못 잡는다 (아이템은 어딘가에서 주는 것으로 보이기 때문)')

  const r = exploreScenario(broken, { players: partyOf(2) })
  const side = r.endings.find((e) => e.id === 'side')!
  assert.equal(side.reachableCombos, 0, '열쇠를 얻을 수 없으니 옆문 엔딩에 닿을 수 없다')
  assert.ok(r.untakenChoices.includes('door.use-key'), '열쇠 선택지를 고를 수 없다')
  console.log('통과: 닿을 수 없는 엔딩 탐지')
}

// 4) 갇히는 상태 탐지: 열쇠를 버리면 영영 나갈 수 없는 시나리오 (정적 검증은 통과)
{
  const trap: Scenario = {
    id: 'trap',
    code: 'T-99',
    name: '갇힘 시험',
    type: 'place',
    blurb: '',
    summary: '',
    observation: [],
    manual: [],
    items: [{ id: 'pass', name: '출입증', text: '출입증.' }],
    facts: [],
    clock: { labels: ['낮'] },
    start: 'a',
    nodes: [
      { id: 'a', kind: 'story', text: '출입증을 받았다.', onEnter: [{ give: 'pass', to: 'all' }], next: 'b' },
      {
        id: 'b',
        kind: 'vote',
        text: '출입증을 어떻게 할까.',
        choices: [
          { id: 'drop', text: '버린다', effects: [{ take: 'pass', from: 'all' }], next: 'c' },
          { id: 'keep', text: '간직한다', next: 'c' },
        ],
      },
      {
        id: 'c',
        kind: 'vote',
        text: '문 앞이다.',
        choices: [
          { id: 'open', text: '출입증으로 연다', when: { item: 'pass' }, locked: '출입증이 있어야 한다', next: 'out' },
          { id: 'wait', text: '기다린다', next: 'c' },
        ],
      },
      { id: 'out', kind: 'ending', tier: 'true', title: '탈출', text: '나갔다.' },
    ],
  }
  const stat = validateScenario(trap)
  assert.deepEqual(stat.errors, [], stat.errors.join('\n'))
  const r = exploreScenario(trap, { players: partyOf(1) })
  assert.ok(r.deadEnds.length > 0, '갇히는 상태를 찾는다')
  assert.ok(r.deadEnds[0].states >= 1)
  assert.match(r.deadEnds[0].path.map((p) => p.label).join(' → '), /버린다/, '길에 "버린다"가 들어 있다')
  assert.equal(r.endings[0].reachableCombos, 1, '열쇠를 간직하면 나갈 수 있다')
  console.log('통과: 갇히는 상태 탐지')
}

// 5) 상태가 너무 많으면 잘렸다고 알린다. 나눠서 돌려도 결과가 같다.
{
  const cut = exploreScenario(demo, { players: partyOf(2), maxStates: 6 })
  assert.equal(cut.truncated, true)

  const whole = exploreScenario(demo, { players: partyOf(2) })
  const ex = new Explorer(demo, { players: partyOf(2) })
  let ticks = 0
  while (!ex.run(3)) ticks++
  assert.ok(ticks > 3, '잘게 나눠 돌렸다')
  const parts = ex.report()
  assert.equal(parts.states, whole.states)
  assert.deepEqual(parts.endings, whole.endings)
  assert.equal(ex.progress.done, true)
  console.log(`통과: 나눠 돌리기·잘림 표시 (${ticks}번에 나눠 돌림)`)
}
