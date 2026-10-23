// 서버 통합 테스트(시나리오 모드): 대기실에서 대상·입사 배경 고르기, 시작 조건, 사람별 화면, 끊김, 강제 진행, 다시 도전.
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { startServer } from '../server/index.ts'
import type { ClientMsg, ServerMsg } from '../src/net/protocol.ts'

type Sstate = Extract<ServerMsg, { t: 'sstate' }>

class Client {
  ws: WebSocket
  joined: Extract<ServerMsg, { t: 'joined' }> | null = null
  lobby: Extract<ServerMsg, { t: 'lobby' }> | null = null
  state: Sstate | null = null
  errors: string[] = []

  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMsg
      if (msg.t === 'joined') this.joined = msg
      else if (msg.t === 'lobby') {
        this.lobby = msg
        this.state = null // 대기실로 돌아왔다
      } else if (msg.t === 'sstate') this.state = msg
      else if (msg.t === 'error') this.errors.push(msg.message)
    })
  }
  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve())
      this.ws.once('error', reject)
    })
  }
  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg))
  }
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('close', () => resolve())
      this.ws.close()
    })
  }
  get view() {
    return this.state!.view
  }
}

async function until(label: string, cond: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`시간 초과: ${label}`)
    await new Promise((r) => setTimeout(r, 8))
  }
}

/** 화면 상태를 보고 지금 할 수 있는 첫 행동을 한다. 할 게 없으면 false. */
function step(c: Client): boolean {
  const v = c.state?.view
  if (!v) return false
  const me = v.players.find((p) => p.id === v.me.id)!
  if (v.phase === 'story' || v.phase === 'result') {
    if (me.ready) return false
    c.send({ t: 'saction', action: { type: 'ready' } })
    return true
  }
  const s = v.scene
  if (!s) return false
  if (v.phase === 'vote' && !s.myChoiceId && !v.me.panic) {
    const pick = s.choices.find((x) => !x.locked)
    if (pick) c.send({ t: 'saction', action: { type: 'vote', choiceId: pick.id } })
    return !!pick
  }
  if (v.phase === 'split' && !s.myChoiceId) {
    const pick = s.choices.find((x) => !x.locked && !x.full)
    if (pick) c.send({ t: 'saction', action: { type: 'pick', actionId: pick.id } })
    return !!pick
  }
  if (v.phase === 'personal') {
    if (s.solo) {
      const pick = s.solo.choices.find((x) => !x.locked)
      c.send(
        pick
          ? { t: 'saction', action: { type: 'solo', choiceId: pick.id } }
          : { t: 'saction', action: { type: 'ready' } },
      )
      return true
    }
    if (!s.myChoiceId && !s.mineDone) {
      const pick = s.choices.find((x) => !x.locked)
      if (pick) c.send({ t: 'saction', action: { type: 'pick', actionId: pick.id } })
      return !!pick
    }
  }
  return false
}

const server = await startServer(0)
const url = `ws://localhost:${server.port}`

try {
  // 1) 대기실: 대상 목록, 기본 선택, 방장만 고를 수 있다
  const a = new Client(url)
  await a.opened()
  a.send({ t: 'create', name: '가가' })
  await until('방 생성', () => !!a.lobby)
  const code = a.joined!.code
  assert.equal(a.lobby!.mode, 'b7-lobby', '기본 대상은 B7 로비')
  assert.deepEqual(a.lobby!.modes.map((m) => m.id), ['b7-lobby'], '플레이할 수 있는 시나리오만 목록에 있다')
  assert.ok(a.lobby!.modes[0].map.x >= 0 && a.lobby!.modes[0].map.y <= 100, '지도 위치가 전해진다')
  assert.deepEqual(a.lobby!.modes[0].party, { min: 2, max: 4 })
  assert.equal(a.lobby!.members[0].archetype, 'rookie')

  const b = new Client(url)
  await b.opened()
  b.send({ t: 'join', code, name: '나나' })
  await until('입장', () => !!b.joined && a.lobby?.members.length === 2)

  b.send({ t: 'mode', mode: 'b7-lobby' })
  await until('방장 아님', () => b.errors.length > 0)
  assert.equal(a.lobby!.mode, 'b7-lobby')
  a.send({ t: 'mode', mode: '없는대상' })
  await until('없는 대상', () => a.errors.length > 0)
  console.log('통과: 대기실(대상 목록·방장만 선택)')

  // 같은 이름, 없는 방은 거절
  const dup = new Client(url)
  await dup.opened()
  dup.send({ t: 'join', code, name: '나나' })
  await until('중복 이름 거절', () => dup.errors.length > 0)
  dup.send({ t: 'join', code: 'ZZZZ', name: '다다' })
  await until('없는 방 거절', () => dup.errors.length > 1)
  await dup.close()
  console.log('통과: 잘못된 입장 거절')

  // 2) 입사 배경 고르기
  a.send({ t: 'archetype', archetype: 'researcher' })
  b.send({ t: 'archetype', archetype: 'field' })
  b.send({ t: 'archetype', archetype: '없는배경' })
  await until(
    '배경 반영',
    () => a.lobby?.members.find((m) => m.name === '나나')?.archetype === 'field' && a.lobby.members[0].archetype === 'researcher',
  )
  await until('없는 배경 거절', () => b.errors.length > 1)
  console.log('통과: 입사 배경 고르기')

  // 3) 시작 조건: B7은 2명 이상. 혼자 방에서는 시작할 수 없다.
  const solo = new Client(url)
  await solo.opened()
  solo.send({ t: 'create', name: '혼자' })
  await until('혼자 방', () => !!solo.lobby)
  solo.send({ t: 'start' })
  await until('인원 부족', () => solo.errors.some((e) => e.includes('2명 이상')))
  await solo.close()

  const errorsBefore = b.errors.length
  b.send({ t: 'start' })
  await until('방장 아님 거절', () => b.errors.length > errorsBefore)
  a.send({ t: 'start' })
  await until('시작', () => !!a.state && !!b.state)
  assert.equal(a.view.scenario.id, 'b7-lobby')
  assert.equal(a.view.phase, 'story')
  assert.notEqual(a.view.me.id, b.view.me.id)
  // 입사 배경의 시작 스텟이 반영되고, 파티원의 스텟이 서로 보인다
  assert.equal(a.view.me.stats.insight, 4, '연구원은 관찰 4')
  assert.equal(b.view.players.find((p) => p.name === '가가')!.stats.insight, 4)
  assert.equal(a.view.players.find((p) => p.name === '나나')!.stats.body, 4, '현장직은 체력 4')
  console.log('통과: 시작 조건(인원)·사람마다 자기 화면·입사 배경 스텟')

  // 4) 행동: 이야기 → 개인 장면. 선택은 서로 보이고, 개인 결과는 본인만 안다.
  a.send({ t: 'saction', action: { type: 'ready' } })
  b.send({ t: 'saction', action: { type: 'ready' } })
  await until('첫 인상', () => a.state?.view.phase === 'personal' && b.state?.view.phase === 'personal')
  a.send({ t: 'saction', action: { type: 'pick', actionId: 'desk' } })
  await until('선택 공개', () => !!b.view.scene!.choices.find((c) => c.id === 'desk')!.pickerIds.includes(a.view.me.id))
  b.send({ t: 'saction', action: { type: 'pick', actionId: 'lights' } })
  await until('개인 결과', () => a.state?.view.phase === 'result' && b.state?.view.phase === 'result')
  assert.match(a.view.result!.mine!.text, /방명록/)
  assert.match(b.view.result!.mine!.text, /조명/)
  assert.ok(!JSON.stringify(a.state!.view).includes('반 칸 어두워지더니'), '남의 개인 결과는 전달되지 않는다')
  console.log('통과: 개인 장면(선택 공개·개인 결과 비공개)')

  // 잘못된 메시지는 무시된다 (서버가 죽지도, 상태가 바뀌지도 않는다)
  const phaseNow = a.view.phase
  a.ws.send('이건 JSON이 아님')
  a.ws.send(JSON.stringify({ t: 'saction', action: { type: 'pick', actionId: 123 } }))
  a.ws.send(JSON.stringify({ t: 'nope' }))
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(a.view.phase, phaseNow)
  console.log('통과: 잘못된 메시지 무시')

  // 5) 읽는 중 전달
  a.send({ t: 'reading', reading: true })
  await until('읽는 중 전달', () => !!b.state?.reading.includes(a.view.me.id))
  a.send({ t: 'reading', reading: false })
  console.log('통과: 읽는 중 전달')

  // 6) 접속이 끊긴 사람을 기다리지 않고 진행하고, 토큰으로 돌아오면 같은 자리다
  const bToken = b.joined!.token
  const bId = b.view.me.id
  await b.close()
  await until('끊김 표시', () => a.state?.online[bId] === false)
  a.send({ t: 'saction', action: { type: 'ready' } })
  await until('끊긴 사람 없이 진행', () => a.state?.view.phase === 'split')
  const b2 = new Client(url)
  await b2.opened()
  b2.send({ t: 'rejoin', code, token: bToken })
  await until('재접속', () => !!b2.state)
  assert.equal(b2.view.me.id, bId)
  assert.equal(b2.view.phase, 'split')
  await until('접속 복구', () => a.state?.online[bId] === true)
  console.log('통과: 끊긴 사람 건너뛰기·재접속')

  // 틀린 토큰은 거절, 시작된 방에는 새로 들어올 수 없다
  const evil = new Client(url)
  await evil.opened()
  evil.send({ t: 'rejoin', code, token: 'nope' })
  await until('틀린 토큰 거절', () => evil.errors.length > 0)
  evil.send({ t: 'join', code, name: '늦은사람' })
  await until('시작된 방 입장 거절', () => evil.errors.length > 1)
  await evil.close()
  console.log('통과: 틀린 토큰·시작된 방 입장 거절')

  // 7) 엔딩까지 진행 (두 사람이 행동 가능한 첫 선택을 계속 고른다), 방장 강제 진행으로 막힌 곳도 푼다
  const clients = [a, b2]
  const start = Date.now()
  let lastForce = 0
  while (!(a.state?.view.phase === 'ended' && b2.state?.view.phase === 'ended')) {
    if (Date.now() - start > 60000) throw new Error('시간 초과: 엔딩까지 진행')
    let moved = false
    for (const c of clients) moved = step(c) || moved
    // 동률이나 정원으로 막히면 방장이 강제로 진행한다
    if (!moved && Date.now() - lastForce > 250) {
      a.send({ t: 'force' })
      lastForce = Date.now()
    }
    await new Promise((r) => setTimeout(r, 8))
  }
  const ending = a.view.ending!
  assert.ok(ending.title.length > 0)
  assert.ok(a.view.endings.reached.some((e) => e.id === ending.id))
  console.log(`통과: 엔딩까지 진행 (${ending.title})`)

  // 8) 다시 도전: 방장만, 단서 노트와 닿은 엔딩은 남는다
  const notebookBefore = a.view.notebook.length
  b2.send({ t: 'retry' })
  await until('방장 아님', () => b2.errors.length > 0)
  assert.equal(a.state!.view.phase, 'ended')
  a.send({ t: 'retry' })
  await until('새 판', () => a.state?.view.runNo === 2 && b2.state?.view.runNo === 2)
  assert.equal(a.view.phase, 'story')
  assert.equal(a.view.notebook.length, notebookBefore, '단서 노트는 남는다')
  assert.ok(a.view.endings.reached.length >= 1, '닿은 엔딩 기록이 남는다')
  assert.equal(a.view.me.stats.insight, 4, '입사 배경은 유지된다')
  console.log('통과: 다시 도전(방장만·노트 유지)')

  // 9) 엔딩 전에는 대기실로 돌아갈 수 없다
  a.send({ t: 'rematch' })
  await until('엔딩 전 거절', () => a.errors.some((e) => e.includes('엔딩 뒤')))
  await a.close()
  await b2.close()
  console.log('\n모든 시나리오 네트워크 테스트 통과')
} finally {
  await server.close()
}
