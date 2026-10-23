// 규칙 확인용 스모크 테스트: 같은 입력이면 같은 결과, 화면용 상태가 비공개 정보를 숨기는지, 잘못된 행동이 무시되는지.
import assert from 'node:assert/strict'
import { context as ctx } from '../src/content/index.ts'
import { createGame, reduce, voteChoices, nightChoicesFor, type GameAction } from '../src/engine/game.ts'
import { viewFor } from '../src/engine/view.ts'

const players = [
  { id: 'a', name: '가' },
  { id: 'b', name: '나' },
]

// 1) 결정성: 같은 시드와 같은 행동 기록이면 상태가 같다
function run(seed: number) {
  let s = createGame(ctx, { seed, players })
  const log: GameAction[] = []
  const act = (a: GameAction) => {
    log.push(a)
    s = reduce(ctx, s, a)
  }
  act({ type: 'ready', playerId: 'a' })
  act({ type: 'ready', playerId: 'b' })
  assert.equal(s.phase, 'vote')
  const first = voteChoices(ctx, s)[0].id
  act({ type: 'vote', playerId: 'a', choiceId: first })
  assert.equal(s.phase, 'vote', '한 명만 골랐으면 아직 진행하지 않는다')
  act({ type: 'vote', playerId: 'b', choiceId: first })
  assert.equal(s.phase, 'result')
  return { s, log }
}
const r1 = run(7)
const r2 = run(7)
assert.deepEqual(r1.s, r2.s)
console.log('통과: 결정성')

// 2) 잘못된 행동은 상태를 바꾸지 않는다
const g = createGame(ctx, { seed: 3, players })
assert.equal(reduce(ctx, g, { type: 'vote', playerId: 'a', choiceId: 'x' }), g, 'briefing 중 투표는 무시')
assert.equal(reduce(ctx, g, { type: 'ready', playerId: 'zzz' }), g, '모르는 플레이어는 무시')
console.log('통과: 잘못된 행동 무시')

// 3) 밤 결과의 비공개: 남의 선택·획득물은 화면에 안 나온다
let s = createGame(ctx, { seed: 11, players })
const advance = (until: string) => {
  let guard = 0
  while (s.phase !== until && guard++ < 5000) {
    if (s.phase === 'briefing' || s.phase === 'result') {
      s = reduce(ctx, s, { type: 'ready', playerId: 'a' })
      s = reduce(ctx, s, { type: 'ready', playerId: 'b' })
    } else if (s.phase === 'vote') {
      const c = voteChoices(ctx, s)[0].id
      s = reduce(ctx, s, { type: 'vote', playerId: 'a', choiceId: c })
      s = reduce(ctx, s, { type: 'vote', playerId: 'b', choiceId: c })
    } else if (s.phase === 'night') {
      for (const p of s.players.filter((x) => x.alive)) {
        s = reduce(ctx, s, { type: 'night', playerId: p.id, choiceId: s.night!.deal[p.id][0] })
      }
    }
  }
}
advance('night')
assert.equal(s.phase, 'night')
const viewA = viewFor(ctx, s, 'a')
assert.deepEqual(
  viewA.scene?.choices.map((c) => c.id),
  nightChoicesFor(ctx, s, 'a').map((c) => c.id),
  '밤에는 자기 몫 선택지만 보인다',
)
s = reduce(ctx, s, { type: 'night', playerId: 'a', choiceId: s.night!.deal.a[0] })
assert.equal(viewFor(ctx, s, 'b').players.find((p) => p.id === 'a')?.acted, true, '골랐는지는 모두 알 수 있다')
s = reduce(ctx, s, { type: 'night', playerId: 'b', choiceId: s.night!.deal.b[0] })
assert.equal(s.phase, 'result')
const resultB = viewFor(ctx, s, 'b').result
assert.equal(resultB?.kind, 'night')
if (resultB?.kind === 'night') {
  const other = resultB.entries.find((e) => e.playerId === 'a')!
  assert.equal(other.self, false)
  assert.ok(!('text' in other) && !('choiceId' in other), '남의 밤 결과 문장·선택은 숨겨진다')
}
console.log('통과: 밤 결과 비공개')

// 4) 한 달이 끝나면 다음 달로 넘어간다
const monthBefore = s.monthNumber
advance('ended')
assert.ok(s.ending, '언젠가 엔딩에 닿는다')
assert.ok(s.monthNumber >= monthBefore)
console.log(`통과: 끝까지 진행 (엔딩 ${s.ending!.id}, ${s.ending!.month}번째 달)`)
