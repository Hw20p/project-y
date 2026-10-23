// 서버 통합 테스트: 실제 WebSocket으로 방 만들기·입장·시작·투표·끊김·재접속·읽는 중 전달을 확인한다.
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { startServer } from '../server/index.ts'
import type { ClientMsg, ServerMsg } from '../src/net/protocol.ts'

class Client {
  ws: WebSocket
  joined: Extract<ServerMsg, { t: 'joined' }> | null = null
  lobby: Extract<ServerMsg, { t: 'lobby' }> | null = null
  state: Extract<ServerMsg, { t: 'state' }> | null = null
  errors: string[] = []

  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMsg
      if (msg.t === 'joined') this.joined = msg
      else if (msg.t === 'lobby') this.lobby = msg
      else if (msg.t === 'state') this.state = msg
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
}

async function until(label: string, cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`시간 초과: ${label}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

const server = await startServer(0)
const url = `ws://localhost:${server.port}`

try {
  // 1) 방 만들기와 입장
  const a = new Client(url)
  await a.opened()
  a.send({ t: 'create', name: '가가' })
  await until('방 생성', () => !!a.joined && !!a.lobby)
  const code = a.joined!.code
  assert.match(code, /^[A-Z]{4}$/)

  const b = new Client(url)
  await b.opened()
  b.send({ t: 'join', code, name: '나나' })
  await until('입장', () => !!b.joined)
  await until('로비 갱신', () => a.lobby?.members.length === 2)
  assert.equal(a.lobby!.hostId, a.joined!.playerId)
  console.log(`통과: 방 ${code} 만들기·입장`)

  // 같은 이름, 없는 방, 이름 없음은 거절
  const dup = new Client(url)
  await dup.opened()
  dup.send({ t: 'join', code, name: '나나' })
  await until('중복 이름 거절', () => dup.errors.length > 0)
  dup.send({ t: 'join', code: 'ZZZZ', name: '다다' })
  await until('없는 방 거절', () => dup.errors.length > 1)
  await dup.close()
  console.log('통과: 잘못된 입장 거절')

  // 2) 방장만 시작
  b.send({ t: 'start' })
  await until('방장 아님 거절', () => b.errors.length > 0)
  assert.equal(a.state, null)
  a.send({ t: 'start' })
  await until('시작', () => !!a.state && !!b.state)
  assert.equal(a.state!.view.phase, 'briefing')
  assert.notEqual(a.state!.view.me.id, b.state!.view.me.id)
  assert.equal(a.state!.view.players.length, 2)
  console.log('통과: 방장만 시작, 사람마다 자기 화면')

  // 3) 읽는 중은 파티원에게 전달된다
  a.send({ t: 'reading', reading: true })
  await until('읽는 중 전달', () => !!b.state?.reading.includes(a.joined!.playerId))
  a.send({ t: 'reading', reading: false })
  await until('읽는 중 해제', () => !b.state?.reading.includes(a.joined!.playerId))
  console.log('통과: 읽는 중 전달')

  // 4) 둘 다 준비하면 낮으로, 투표 현황이 상대에게 보인다
  a.send({ t: 'action', action: { type: 'ready' } })
  b.send({ t: 'action', action: { type: 'ready' } })
  await until('낮 시작', () => a.state?.view.phase === 'vote' && b.state?.view.phase === 'vote')
  const choices = a.state!.view.scene!.choices
  a.send({ t: 'action', action: { type: 'vote', choiceId: choices[0].id } })
  await until('투표 현황 공개', () => {
    const seen = b.state?.view.scene?.choices.find((c) => c.id === choices[0].id)
    return !!seen?.voterIds.includes(a.joined!.playerId)
  })
  b.send({ t: 'action', action: { type: 'vote', choiceId: choices[0].id } })
  await until('결과', () => a.state?.view.phase === 'result')
  assert.equal(a.state!.view.result?.kind, 'team')
  console.log('통과: 준비·투표 현황 공개·결과')

  // 5) 잘못된 메시지는 무시된다
  a.ws.send('이건 JSON이 아님')
  a.ws.send(JSON.stringify({ t: 'action', action: { type: 'vote', choiceId: 123 } }))
  a.ws.send(JSON.stringify({ t: 'nope' }))
  console.log('통과: 잘못된 메시지 무시')

  // 6) 접속이 끊긴 사람을 기다리지 않고 진행하고, 토큰으로 돌아오면 같은 자리다
  const bToken = b.joined!.token
  const bId = b.joined!.playerId
  await b.close()
  await until('끊김 표시', () => a.state?.online[bId] === false)
  a.send({ t: 'action', action: { type: 'ready' } })
  await until('끊긴 사람 없이 진행', () => a.state?.view.phase !== 'result')
  const phaseBefore = a.state!.view.phase
  console.log(`통과: 끊긴 사람을 기다리지 않음 (${phaseBefore})`)

  const b2 = new Client(url)
  await b2.opened()
  b2.send({ t: 'rejoin', code, token: bToken })
  await until('재접속', () => !!b2.state)
  assert.equal(b2.state!.view.me.id, bId)
  await until('접속 표시 복구', () => a.state?.online[bId] === true)
  console.log('통과: 토큰으로 같은 자리에 재접속')

  // 틀린 토큰은 거절
  const evil = new Client(url)
  await evil.opened()
  evil.send({ t: 'rejoin', code, token: 'nope' })
  await until('틀린 토큰 거절', () => evil.errors.length > 0)
  await evil.close()
  console.log('통과: 틀린 토큰 거절')

  // 7) 시작된 방에는 새로 들어올 수 없다
  const late = new Client(url)
  await late.opened()
  late.send({ t: 'join', code, name: '늦은이' })
  await until('늦은 입장 거절', () => late.errors.length > 0)
  await late.close()
  console.log('통과: 시작된 방 입장 거절')

  await a.close()
  await b2.close()
  console.log('\n모든 네트워크 테스트 통과')
} finally {
  await server.close()
}
