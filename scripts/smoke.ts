// 시나리오 엔진 스모크 테스트: 시험용 시나리오로 모든 기능을 한 번씩 확인한다.
import assert from 'node:assert/strict'
import {
  actionState,
  createScenarioGame,
  currentNode,
  openVoteChoices,
  reduceScenario,
  type ScenarioAction,
} from '../src/scenario/game.ts'
import { demo } from '../src/scenario/fixtures/demo.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import type { Scenario } from '../src/scenario/types.ts'
import { validateScenario } from '../src/scenario/validate.ts'
import { viewForScenario } from '../src/scenario/view.ts'

const two = [
  { id: 'a', name: '가' },
  { id: 'b', name: '나' },
]
const act = (g: ScenarioGame, a: ScenarioAction) => reduceScenario(demo, g, a)
const readyAll = (g: ScenarioGame, ids = ['a', 'b']) => ids.reduce((s, id) => act(s, { type: 'ready', playerId: id }), g)
const pick = (g: ScenarioGame, id: string, actionId: string) => act(g, { type: 'pick', playerId: id, actionId })

/** 지정한 `code`가 뽑히는 시드를 찾는다 */
function seedWithCode(code: string): number {
  for (let s = 1; s < 500; s++) if (createScenarioGame(demo, { seed: s, players: two }).run.vars.code === code) return s
  throw new Error('시드를 찾지 못함')
}

// 1) 정적 검증: 시험용 시나리오는 통과하고, 망가진 것은 잡힌다
{
  const ok = validateScenario(demo)
  assert.deepEqual(ok.errors, [], ok.errors.join('\n'))

  const broken = structuredClone(demo) as Scenario
  const hub = broken.nodes.find((n) => n.id === 'hub')
  if (hub?.kind !== 'split') throw new Error('hub')
  hub.outcomes[1].next = '없는장면'
  const door = broken.nodes.find((n) => n.id === 'door')
  if (door?.kind !== 'vote') throw new Error('door')
  door.choices.forEach((c) => (c.when = { flag: 'never-set' }))
  const bad = validateScenario(broken).errors.join('\n')
  assert.match(bad, /없는 장면 "없는장면"/)
  assert.match(bad, /조건 없이 고를 수 있는 선택지가 없음/)
  assert.match(bad, /never-set/)

  const noFallback = structuredClone(demo) as Scenario
  const n2 = noFallback.nodes.find((n) => n.id === 'hub')
  if (n2?.kind !== 'split') throw new Error('hub')
  n2.outcomes.pop()
  assert.match(validateScenario(noFallback).errors.join('\n'), /마지막 결과는 조건 없이/)

  const wrongScope = structuredClone(demo) as Scenario
  const door2 = wrongScope.nodes.find((n) => n.id === 'door')
  if (door2?.kind !== 'vote') throw new Error('door')
  door2.choices[0].result = [{ text: '글', when: { knows: 'note', by: 'me' } }]
  assert.match(validateScenario(wrongScope).errors.join('\n'), /by: "me"/)
  console.log('통과: 정적 검증')
}

// 2) 같은 시드는 같은 판, 무작위 값은 시드마다 바뀐다
{
  const g1 = createScenarioGame(demo, { seed: 42, players: two })
  const g2 = createScenarioGame(demo, { seed: 42, players: two })
  assert.deepEqual(g1, g2)
  const seen = new Set<string | number>()
  for (let s = 1; s < 80; s++) seen.add(createScenarioGame(demo, { seed: s, players: two }).run.vars.code)
  assert.equal(seen.size, 3, '세 값이 모두 나온다')
  assert.equal(g1.run.phase, 'story')
  assert.equal(g1.runNo, 1)
  console.log('통과: 결정성과 판마다 바뀌는 값')
}

// 3) 이야기 장면은 전원이 계속을 눌러야 넘어간다
{
  let g = createScenarioGame(demo, { seed: seedWithCode('파랑'), players: two })
  g = act(g, { type: 'ready', playerId: 'a' })
  assert.equal(g.run.phase, 'story', '한 명만 눌렀으면 그대로')
  assert.equal(act(g, { type: 'vote', playerId: 'a', choiceId: 'x' }), g, '엉뚱한 행동은 무시')
  g = act(g, { type: 'ready', playerId: 'b' })
  assert.equal(g.run.nodeId, 'hub')
  assert.equal(g.run.phase, 'split')
  console.log('통과: 이야기 장면 진행')
}

// 4) 분할 장면: 정원, 비공개 발견, 조합, 부상 제한, 단서 노트
{
  const seed = seedWithCode('파랑')
  let g = readyAll(createScenarioGame(demo, { seed, players: two }))

  // 정원: read-note는 한 사람만
  g = pick(g, 'a', 'read-note')
  const same = pick(g, 'b', 'read-note')
  assert.equal(same, g, '정원이 찬 행동은 고를 수 없다')
  assert.equal(viewForScenario(demo, g, 'b').scene!.choices.find((c) => c.id === 'read-note')!.full, true)
  // 잠긴 행동: 구급 상자가 없으면 쉴 수 없고, 잠긴 문구가 보인다
  assert.equal(pick(g, 'b', 'rest'), g)
  assert.equal(viewForScenario(demo, g, 'b').scene!.choices.find((c) => c.id === 'rest')!.locked, '구급 상자가 있어야 한다')

  // 1라운드: a는 망을 보고 b는 방을 뒤진다 → 조합이 모자라 허브로 돌아가고 시간이 흐른다. b는 안전하게 열쇠를 얻는다.
  g = readyAll(createScenarioGame(demo, { seed, players: two }))
  g = pick(pick(g, 'a', 'guard'), 'b', 'search-room')
  assert.equal(g.run.phase, 'result')
  const rb = viewForScenario(demo, g, 'b').result!
  assert.match(rb.mine!.text, /안심하고/)
  assert.equal(viewForScenario(demo, g, 'a').result!.mine, null, '망만 본 사람은 비공개 발견이 없다')
  assert.ok(!g.run.players[1].hurt, '망을 봐 줘서 다치지 않았다')
  assert.ok(g.run.players[1].items.includes('key'))
  g = readyAll(g)
  assert.equal(g.run.nodeId, 'hub')
  assert.equal(g.run.time, 1)

  // 2라운드: a는 메모를 읽고 b는 다시 뒤진다 → 망 보는 사람이 없어 b가 다친다. 조합이 맞아 문으로 간다.
  g = pick(pick(g, 'a', 'read-note'), 'b', 'search-room')
  const ra = viewForScenario(demo, g, 'a').result!
  assert.match(ra.mine!.text, /파랑/, '메모의 값이 이번 판의 무작위 값으로 바뀐다')
  assert.ok(ra.changes.some((c) => c.kind === 'fact' && c.playerId === 'a'), '단서 획득은 모두에게 보이는 변화로 들어간다 (누가 얻었는지 함께)')
  assert.ok(!ra.mine!.changes.some((c) => c.kind === 'fact'), '단서는 개인 변화에 중복으로 들어가지 않는다')
  assert.deepEqual(viewForScenario(demo, g, 'a').clues.map((c) => [c.id, c.by.map((b) => b.id)]), [['note', ['a']]], '단서 목록에 얻은 사람이 붙는다')
  assert.ok(ra.changes.some((c) => c.kind === 'hurt' && c.playerId === 'b'), '남의 부상은 모두에게 보인다')
  const rbView = viewForScenario(demo, g, 'b').result!
  assert.ok(!rbView.mine!.changes.some((c) => c.kind === 'hurt'), '내 부상은 공용 변화로만 보인다 (중복 없음)')
  assert.ok(rbView.changes.some((c) => c.kind === 'fact' && c.playerId === 'a'), '남의 단서 획득도 모두에게 보인다')
  assert.deepEqual(viewForScenario(demo, g, 'b').clues.map((c) => [c.id, c.by.map((x) => x.id)]), [['note', ['a']]], '다른 사람이 얻은 단서도 b의 단서 목록에 이름과 함께 있다')
  assert.ok(rbView.changes.some((c) => c.kind === 'hurt' && c.playerId === 'b'), '부상은 모두에게 보인다')
  assert.ok(!JSON.stringify(rbView).includes('파랑'), '남의 비공개 글은 전달되지 않는다')
  assert.deepEqual(g.notebooks.a, ['note'])
  assert.deepEqual(g.notebooks.b, [])
  assert.ok(g.run.players[1].hurt)
  g = readyAll(g)
  assert.equal(g.run.nodeId, 'door')
  assert.equal(g.run.time, 2)

  // 단서 노트와 대상 자료: 파티 누구라도 알아낸 단서의 자료는 모두에게 열린다 (노트는 얻은 사람 것만 남는다)
  assert.ok(viewForScenario(demo, g, 'a').entity.dossier.find((d) => d.id === 'note')!.lines)
  assert.ok(viewForScenario(demo, g, 'b').entity.dossier.find((d) => d.id === 'note')!.lines)
  assert.equal(viewForScenario(demo, g, 'a').notebook[0].id, 'note')
  console.log('통과: 분할 장면(정원·비공개 발견·조합·부상·단서 노트)')
}

// 5) 부상자는 몸을 쓰는 행동을 못 한다
{
  let g = readyAll(createScenarioGame(demo, { seed: 3, players: two }))
  g.run.players[1].hurt = true
  const node = currentNode(demo, g)
  if (node.kind !== 'split') throw new Error('split')
  const search = node.actions.find((a) => a.id === 'search-room')!
  assert.deepEqual(actionState(g, search, 'b'), { open: false, reason: '부상 때문에 몸을 굽힐 수 없다' })
  assert.equal(pick(g, 'b', 'search-room'), g)
  g = pick(g, 'b', 'guard')
  assert.equal(g.run.picks.b, 'guard', '부상자도 다른 행동은 고를 수 있다')
  console.log('통과: 부상 제한')
}

// 6) 투표: 동률이면 시드로 하나가 뽑힌다 (같은 판·같은 표면 같은 결과). 결과는 무작위 값으로 갈린다.
{
  const walkToDoor = (seed: number): ScenarioGame => {
    let g = readyAll(createScenarioGame(demo, { seed, players: two }))
    g = readyAll(pick(pick(g, 'a', 'read-note'), 'b', 'search-room'))
    assert.equal(g.run.nodeId, 'door')
    return g
  }

  const blueSeed = seedWithCode('파랑')
  const g0 = walkToDoor(blueSeed)
  // b는 열쇠가 있어서 잠긴 선택지가 열려 있다
  assert.ok(openVoteChoices(g0, currentNode(demo, g0) as never).some((c) => c.id === 'use-key'))
  const g = act(g0, { type: 'vote', playerId: 'a', choiceId: 'red' })
  assert.equal(g.run.phase, 'vote', '한 명만 골랐으면 진행하지 않는다')
  assert.deepEqual(viewForScenario(demo, g, 'b').scene!.choices.find((c) => c.id === 'red')!.pickerIds, ['a'])

  // 동률: 기다리지 않고 바로 추첨으로 하나가 뽑힌다 (결과 화면에 동률이던 선택지들과 뽑힌 것이 담긴다)
  const tie = act(g, { type: 'vote', playerId: 'b', choiceId: 'blue' })
  assert.equal(tie.run.phase, 'result', '동률이면 의논을 기다리지 않고 추첨한다')
  const draw = viewForScenario(demo, tie, 'a').result!.draw
  assert.ok(draw, '추첨 결과가 화면으로 전해진다')
  assert.equal(draw.options.length, 2)
  assert.ok(draw.options.includes(draw.chosen))
  assert.equal(viewForScenario(demo, tie, 'a').result!.choiceText, draw.chosen, '뽑힌 선택지가 결과가 된다')
  assert.deepEqual(viewForScenario(demo, tie, 'b').result!.draw, draw, '같은 추첨 결과가 모두에게 보인다')
  // 같은 판·같은 표면 같은 결과다
  assert.deepEqual(viewForScenario(demo, act(g, { type: 'vote', playerId: 'b', choiceId: 'blue' }), 'a').result!.draw, draw)
  // 시드가 다르면 양쪽이 모두 나올 수 있다
  const chosen = new Set<string>()
  for (let seed = 1; seed < 80; seed++) {
    const t = act(act(walkToDoor(seed), { type: 'vote', playerId: 'a', choiceId: 'red' }), { type: 'vote', playerId: 'b', choiceId: 'blue' })
    chosen.add(viewForScenario(demo, t, 'a').result!.draw!.chosen)
  }
  assert.equal(chosen.size, 2, '동률의 두 쪽이 모두 뽑힐 수 있다')

  // 표가 모이면 추첨 없이 그대로 정해진다 → 정답(파랑)이라 정문으로 (엔딩, 진엔딩)
  const solved = act(act(walkToDoor(blueSeed), { type: 'vote', playerId: 'a', choiceId: 'blue' }), { type: 'vote', playerId: 'b', choiceId: 'blue' })
  assert.equal(solved.run.endingId, 'good')
  assert.equal(viewForScenario(demo, solved, 'a').result, null)
  assert.equal(viewForScenario(demo, solved, 'a').ending!.tier, 'true')
  assert.equal(viewForScenario(demo, solved, 'a').ending!.first, true)

  // 강제 진행: 지금 있는 표(a의 빨강)만으로 정한다 — 틀려서 경보가 울린다
  const forcedA = act(g, { type: 'force' })
  assert.equal(forcedA.run.nodeId, 'trap', '빨강이 한 표였으니 빨강이다')
  assert.equal(forcedA.run.time, 2, '경보로 시간이 흘렀다')

  // 틀린 암호 → 경보로 시간이 흐르고, 두 번 틀려 마감(시계 3)에 닿으면 엔딩
  let w = walkToDoor(blueSeed)
  w = act(act(w, { type: 'vote', playerId: 'a', choiceId: 'red' }), { type: 'vote', playerId: 'b', choiceId: 'red' })
  assert.equal(w.run.nodeId, 'trap')
  assert.equal(w.run.phase, 'story')
  w = readyAll(w)
  assert.equal(w.run.nodeId, 'door')
  w = act(act(w, { type: 'vote', playerId: 'a', choiceId: 'red' }), { type: 'vote', playerId: 'b', choiceId: 'red' })
  assert.equal(w.run.nodeId, 'late', '시계가 3에 닿아 마감 엔딩')
  assert.equal(w.run.endingId, 'late')

  // 열쇠로 옆문: 결과 서술이 있고, 계속을 누르면 옆문 엔딩. 메모를 안 본 b에게만 아쉬운 문장이 붙는다.
  let k = walkToDoor(blueSeed)
  k = act(act(k, { type: 'vote', playerId: 'a', choiceId: 'use-key' }), { type: 'vote', playerId: 'b', choiceId: 'use-key' })
  assert.equal(k.run.phase, 'result')
  assert.match(k.run.result!.text, /옆문이 삐걱/)
  k = readyAll(k)
  assert.equal(k.run.endingId, 'side')
  assert.doesNotMatch(viewForScenario(demo, k, 'a').ending!.text, /끝내 몰랐다/)
  assert.match(viewForScenario(demo, k, 'b').ending!.text, /끝내 몰랐다/)
  console.log('통과: 투표(동률·강제 진행·무작위 값으로 갈리는 길·마감·옆문)')
}

// 7) 전원 부상이면 정해진 엔딩으로
{
  let g = readyAll(createScenarioGame(demo, { seed: 11, players: two }))
  g = pick(pick(g, 'a', 'search-room'), 'b', 'search-room')
  g = readyAll(g)
  assert.equal(g.run.endingId, 'wiped')
  console.log('통과: 전원 부상 엔딩')
}

// 8) 다시 도전: 새 판, 단서 노트와 닿은 엔딩은 남는다
{
  let g = readyAll(createScenarioGame(demo, { seed: seedWithCode('파랑'), players: two }))
  g = readyAll(pick(pick(g, 'a', 'read-note'), 'b', 'search-room'))
  g = act(act(g, { type: 'vote', playerId: 'a', choiceId: 'blue' }), { type: 'vote', playerId: 'b', choiceId: 'blue' })
  assert.equal(g.run.phase, 'ended')
  assert.equal(act(g, { type: 'ready', playerId: 'a' }), g, '엔딩 뒤에는 ready를 받지 않는다')
  const again = act(g, { type: 'retry' })
  assert.equal(again.runNo, 2)
  assert.equal(again.run.phase, 'story')
  assert.equal(again.run.time, 0)
  assert.deepEqual(again.run.players.map((p) => p.facts), [[], []], '이번 판의 단서는 비워진다')
  assert.deepEqual(again.notebooks.a, ['note'], '단서 노트는 남는다')
  assert.equal(again.endings.good, 1)
  const v = viewForScenario(demo, again, 'a')
  assert.equal(v.notebook.length, 1)
  assert.equal(v.endings.total, 4)
  assert.deepEqual(v.endings.reached.map((e) => e.id), ['good'])
  assert.equal(act(readyAll(createScenarioGame(demo, { seed: 1, players: two })), { type: 'retry' }).runNo, 1, '엔딩 전에는 다시 도전할 수 없다')
  console.log('통과: 다시 도전(단서 노트·엔딩 기록 유지)')
}

// 9) 무작위로 아무렇게나 눌러도 멈추거나 에러 나지 않는다 (인원 1~4명)
{
  let ended = 0
  const endings = new Map<string, number>()
  for (let seed = 1; seed <= 400; seed++) {
    const n = 1 + (seed % 4)
    const roster = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    let g = createScenarioGame(demo, { seed, players: roster })
    let steps = 0
    // 간단한 난수열(시드마다 다르게)
    let r = seed * 2654435761
    const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296)
    while (g.run.phase !== 'ended' && steps++ < 400) {
      const node = currentNode(demo, g)
      const p = roster[Math.floor(rnd() * n)]
      let a: ScenarioAction
      if (g.run.phase === 'story' || g.run.phase === 'result') a = { type: 'ready', playerId: p.id }
      else if (node.kind === 'vote') {
        const open = openVoteChoices(g, node)
        a = { type: 'vote', playerId: p.id, choiceId: open[Math.floor(rnd() * open.length)].id }
      } else if (node.kind === 'split') {
        a = { type: 'pick', playerId: p.id, actionId: node.actions[Math.floor(rnd() * node.actions.length)].id }
      } else break
      g = act(g, a)
      // 가끔 막히면(정원 등) 강제 진행
      if (steps % 37 === 0 && g.run.phase !== 'ended') g = act(g, { type: 'force' })
    }
    assert.equal(g.run.phase, 'ended', `시드 ${seed}(${n}명)가 ${steps}번 안에 끝나지 않음`)
    ended++
    endings.set(g.run.endingId!, (endings.get(g.run.endingId!) ?? 0) + 1)
  }
  assert.ok(endings.size >= 3, '여러 엔딩에 닿는다')
  console.log(`통과: 무작위 400판 모두 종료 (${[...endings].map(([k, v]) => `${k} ${v}`).join(', ')})`)
}

// 10) 나중에 적용되는 효과(`later`): 분할 장면에서 "그 행동을 고른 사람"에게 다음 장면에서 적용된다
{
  const later = structuredClone(demo) as Scenario
  const hub = later.nodes.find((n) => n.id === 'hub')
  if (hub?.kind !== 'split') throw new Error('hub')
  hub.outcomes[1].later = [{ hurt: { picked: 'guard' } }]
  assert.deepEqual(validateScenario(later).errors, [])
  const a1 = (g: ScenarioGame, x: ScenarioAction) => reduceScenario(later, g, x)
  let g = createScenarioGame(later, { seed: 5, players: two })
  g = ['a', 'b'].reduce((s, id) => a1(s, { type: 'ready', playerId: id }), g)
  g = a1(a1(g, { type: 'pick', playerId: 'a', actionId: 'guard' }), { type: 'pick', playerId: 'b', actionId: 'search-room' })
  assert.equal(g.run.phase, 'result')
  assert.equal(g.run.players[0].hurt, false, '망을 본 a는 아직 다치지 않았다')
  g = ['a', 'b'].reduce((s, id) => a1(s, { type: 'ready', playerId: id }), g)
  assert.equal(g.run.nodeId, 'hub')
  assert.equal(g.run.players[0].hurt, true, '다음 장면에 들어오며 적용되었다')
  assert.deepEqual(viewForScenario(later, g, 'b').aftermath, [{ kind: 'hurt', playerId: 'a' }], '모두에게 여파로 보인다')
  console.log('통과: 나중에 적용되는 효과(분할 장면·picked 대상)')
}
