// 방 하나의 로직. 소켓을 직접 모르고, 멤버마다 `send` 함수만 가진다 (그래서 소켓 없이도 테스트할 수 있다).
// 규칙은 전부 엔진의 `reduce`가 정하고, 여기서는 "누가 보낸 행동인지 확인하기", "접속이 끊긴 사람 건너뛰기",
// "누구에게 무엇을 보여 줄지"만 맡는다.
import { randomBytes } from 'node:crypto'
import { context } from '../src/content/index.ts'
import { CONFIG } from '../src/engine/config.ts'
import { createGame, reduce } from '../src/engine/game.ts'
import type { GameState } from '../src/engine/state.ts'
import { viewFor, type ClientAction } from '../src/engine/view.ts'
import { cleanName, type ServerMsg } from '../src/net/protocol.ts'

export type Send = (msg: ServerMsg) => void

export interface Member {
  id: string
  name: string
  /** 다시 들어올 때 내밀 비밀 값 */
  token: string
  /** 접속 중이면 메시지를 보내는 함수, 끊겼으면 null */
  send: Send | null
  /** 스스로 나간 사람 (게임 중이면 자리는 남지만 돌아올 수 없다) */
  left: boolean
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export class Room {
  readonly code: string
  members: Member[] = []
  hostId = ''
  game: GameState | null = null
  lastActivity = Date.now()

  private reading = new Set<string>()
  private sceneKey = ''
  private nextId = 1

  constructor(code: string) {
    this.code = code
  }

  get started(): boolean {
    return this.game !== null
  }

  get onlineCount(): number {
    return this.members.filter((m) => m.send).length
  }

  // ───────────── 입장·퇴장 ─────────────

  join(rawName: string, send: Send): Result<Member> {
    const name = cleanName(rawName)
    if (!name) return { ok: false, error: '이름을 입력해 주세요.' }
    if (this.started) return { ok: false, error: '이미 시작된 방입니다.' }
    if (this.members.length >= CONFIG.MAX_PLAYERS) return { ok: false, error: '방이 가득 찼습니다.' }
    if (this.members.some((m) => m.name === name)) return { ok: false, error: '같은 이름이 이미 있습니다.' }

    const member: Member = {
      id: `p${this.nextId++}`,
      name,
      token: randomBytes(16).toString('hex'),
      send,
      left: false,
    }
    this.members.push(member)
    if (!this.hostId) this.hostId = member.id
    this.touch()
    return { ok: true, value: member }
  }

  /** 토큰으로 같은 자리에 다시 앉는다 */
  rejoin(token: string, send: Send): Result<Member> {
    const member = this.members.find((m) => m.token === token && !m.left)
    if (!member) return { ok: false, error: '이 방에서 내 자리를 찾을 수 없습니다.' }
    member.send = send
    if (!this.hostId || !this.members.find((m) => m.id === this.hostId)?.send) this.hostId = member.id
    this.touch()
    this.settle()
    this.broadcast()
    return { ok: true, value: member }
  }

  /** 접속이 끊겼다. 자리는 남겨 두고, 게임 중이면 이 사람을 기다리지 않고 진행한다. */
  disconnect(member: Member, send: Send): void {
    if (member.send !== send) return // 이미 새 연결로 바뀐 뒤의 옛 연결이 닫힌 것
    member.send = null
    this.reading.delete(member.id)
    this.reassignHost()
    this.touch()
    this.settle()
    this.broadcast()
  }

  /** 스스로 나간다 */
  leave(member: Member): void {
    member.send = null
    this.reading.delete(member.id)
    if (!this.started) {
      this.members = this.members.filter((m) => m.id !== member.id)
    } else {
      member.left = true
      member.token = ''
    }
    this.reassignHost()
    this.touch()
    this.settle()
    this.broadcast()
  }

  private reassignHost(): void {
    const host = this.members.find((m) => m.id === this.hostId)
    if (host?.send) return
    const next = this.members.find((m) => m.send)
    if (next) this.hostId = next.id
  }

  // ───────────── 게임 ─────────────

  start(by: Member): Result<true> {
    if (this.started) return { ok: false, error: '이미 시작되었습니다.' }
    if (by.id !== this.hostId) return { ok: false, error: '방장만 시작할 수 있습니다.' }
    // 시작 순간 접속해 있는 사람만 함께한다
    this.members = this.members.filter((m) => m.send)
    if (this.members.length === 0) return { ok: false, error: '참가자가 없습니다.' }
    const seed = randomBytes(4).readUInt32BE(0)
    this.game = createGame(context, {
      seed,
      players: this.members.map((m) => ({ id: m.id, name: m.name })),
    })
    this.sceneKey = this.keyOf(this.game)
    this.touch()
    this.broadcast()
    return { ok: true, value: true }
  }

  act(member: Member, action: ClientAction): void {
    if (!this.game) return
    this.commit(reduce(context, this.game, { ...action, playerId: member.id }))
  }

  /** 방장 전용: 안 고른 사람을 기다리지 않고 진행 */
  force(by: Member): void {
    if (!this.game || by.id !== this.hostId) return
    this.commit(reduce(context, this.game, { type: 'force' }))
  }

  setReading(member: Member, reading: boolean): void {
    if (!this.game || this.game.phase === 'ended') return
    const had = this.reading.has(member.id)
    if (reading === had) return
    if (reading) this.reading.add(member.id)
    else this.reading.delete(member.id)
    this.broadcast()
  }

  private keyOf(g: GameState): string {
    return `${g.phase}|${g.monthNumber}|${g.month?.beatIndex}|${g.lastResult?.kind}`
  }

  private commit(next: GameState): void {
    if (!this.game || next === this.game) return
    this.game = next
    // 장면이 바뀌면 "읽는 중"은 처음부터 다시 센다 (각 클라이언트가 새 장면에서 다시 알린다)
    const key = this.keyOf(next)
    if (key !== this.sceneKey) {
      this.sceneKey = key
      this.reading.clear()
    }
    this.touch()
    this.settle()
    this.broadcast()
  }

  /**
   * 접속이 끊긴 사람 때문에 멈추지 않게 한다: 접속 중인 사람이 모두 할 일을 마쳤는데 게임이 안 넘어갔다면
   * (끊긴 사람이 남아 있어서) 지금 있는 선택만으로 진행한다.
   */
  private settle(): void {
    for (let guard = 0; guard < 8; guard++) {
      const g = this.game
      if (!g || g.phase === 'ended') return
      const online = new Set(this.members.filter((m) => m.send).map((m) => m.id))
      if (online.size === 0) return

      let stuck: boolean
      switch (g.phase) {
        case 'briefing':
        case 'result':
          stuck = [...online].every((id) => g.ready.includes(id))
          break
        case 'vote': {
          const waiting = g.players.filter((p) => p.alive && online.has(p.id))
          stuck = waiting.length > 0 && waiting.every((p) => g.votes[p.id])
          break
        }
        case 'night': {
          const waiting = g.players.filter((p) => p.alive && online.has(p.id))
          stuck = waiting.length > 0 && waiting.every((p) => g.night?.picks[p.id])
          break
        }
        default:
          return
      }
      if (!stuck) return
      const next = reduce(context, g, { type: 'force' })
      if (next === g) return
      this.game = next
      const key = this.keyOf(next)
      if (key !== this.sceneKey) {
        this.sceneKey = key
        this.reading.clear()
      }
    }
  }

  // ───────────── 전송 ─────────────

  broadcast(): void {
    for (const m of this.members) {
      if (m.send) m.send(this.messageFor(m))
    }
  }

  messageFor(m: Member): ServerMsg {
    if (!this.game) {
      return {
        t: 'lobby',
        code: this.code,
        you: m.id,
        hostId: this.hostId,
        members: this.members.map((x) => ({ id: x.id, name: x.name, online: !!x.send })),
      }
    }
    return {
      t: 'state',
      code: this.code,
      hostId: this.hostId,
      online: Object.fromEntries(this.members.map((x) => [x.id, !!x.send])),
      reading: [...this.reading],
      view: viewFor(context, this.game, m.id),
    }
  }

  private touch(): void {
    this.lastActivity = Date.now()
  }
}
