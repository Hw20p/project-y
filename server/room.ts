// 방 하나의 로직. 소켓을 직접 모르고, 멤버마다 `send` 함수만 가진다 (그래서 소켓 없이도 테스트할 수 있다).
// 규칙은 전부 시나리오 엔진(`reduceScenario`)이 정하고, 여기서는 "누가 보낸 행동인지 확인하기",
// "접속이 끊긴 사람 건너뛰기", "누구에게 무엇을 보여 줄지", "대기실에서 대상·입사 배경 고르기"만 맡는다.
import { randomBytes } from 'node:crypto'
import { findScenario, playableScenarios } from '../src/content/scenarios/index.ts'
import { cleanName, MAX_PLAYERS, type LobbyModeInfo, type ScenarioClientAction, type ServerMsg } from '../src/net/protocol.ts'
import { createScenarioGame, currentNode, reduceScenario, splitPickers, type ScenarioAction } from '../src/scenario/game.ts'
import type { ScenarioGame } from '../src/scenario/state.ts'
import { ARCHETYPES, DEFAULT_ARCHETYPE, isPanicked } from '../src/scenario/stats.ts'
import { viewForScenario } from '../src/scenario/view.ts'

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
  /** 대기실에서 고른 입사 배경 (시작 스텟) */
  archetype: string
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** 대기실에서 고를 수 있는 것들: 플레이할 수 있는 시나리오 */
export function lobbyModes(): LobbyModeInfo[] {
  return playableScenarios.map((s, i) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    blurb: s.blurb,
    type: s.type,
    party: s.party ?? { min: 1, max: MAX_PLAYERS },
    // 지도 위치를 정하지 않은 시나리오는 겹치지 않게 가로로 흩어 둔다
    map: s.map ?? { x: 20 + ((i * 23) % 60), y: 40 },
  }))
}

export class Room {
  readonly code: string
  members: Member[] = []
  hostId = ''
  /** 대기실에서 고른 시나리오 id */
  mode: string = playableScenarios[0]?.id ?? ''
  /** 진행 중인 게임 (대기실이면 null) */
  sgame: ScenarioGame | null = null
  lastActivity = Date.now()

  private reading = new Set<string>()
  private sceneKey = ''
  private nextId = 1
  /** 지금까지 시작한 판의 수. 같은 방에서 새 판을 할 때마다 늘어난다. */
  private gameNo = 0

  constructor(code: string) {
    this.code = code
  }

  get started(): boolean {
    return this.sgame !== null
  }

  get onlineCount(): number {
    return this.members.filter((m) => m.send).length
  }

  // ───────────── 입장·퇴장 ─────────────

  join(rawName: string, send: Send): Result<Member> {
    const name = cleanName(rawName)
    if (!name) return { ok: false, error: '이름을 입력해 주세요.' }
    if (this.started) return { ok: false, error: '이미 시작된 방입니다.' }
    if (this.members.length >= MAX_PLAYERS) return { ok: false, error: '방이 가득 찼습니다.' }
    if (this.members.some((m) => m.name === name)) return { ok: false, error: '같은 이름이 이미 있습니다.' }

    const member: Member = {
      id: `p${this.nextId++}`,
      name,
      token: randomBytes(16).toString('hex'),
      send,
      left: false,
      archetype: DEFAULT_ARCHETYPE,
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

  // ───────────── 대기실 ─────────────

  /** 방장 전용(대기실): 이 방에서 할 대상을 고른다 */
  setMode(by: Member, mode: string): Result<true> {
    if (this.started) return { ok: false, error: '이미 시작되었습니다.' }
    if (by.id !== this.hostId) return { ok: false, error: '방장만 대상을 고를 수 있습니다.' }
    if (!lobbyModes().some((m) => m.id === mode)) return { ok: false, error: '알 수 없는 대상입니다.' }
    this.mode = mode
    this.touch()
    this.broadcast()
    return { ok: true, value: true }
  }

  /** 대기실: 내 입사 배경을 고른다 */
  setArchetype(member: Member, archetype: string): Result<true> {
    if (this.started) return { ok: false, error: '이미 시작되었습니다.' }
    if (!ARCHETYPES.some((a) => a.id === archetype)) return { ok: false, error: '알 수 없는 입사 배경입니다.' }
    member.archetype = archetype
    this.touch()
    this.broadcast()
    return { ok: true, value: true }
  }

  // ───────────── 게임 ─────────────

  start(by: Member): Result<true> {
    if (this.started) return { ok: false, error: '이미 시작되었습니다.' }
    if (by.id !== this.hostId) return { ok: false, error: '방장만 시작할 수 있습니다.' }
    // 시작 순간 접속해 있는 사람만 함께한다
    const present = this.members.filter((m) => m.send)
    if (present.length === 0) return { ok: false, error: '참가자가 없습니다.' }

    const sc = findScenario(this.mode)
    if (!sc) return { ok: false, error: '알 수 없는 대상입니다.' }
    const party = sc.party ?? { min: 1, max: MAX_PLAYERS }
    if (present.length < party.min) return { ok: false, error: `「${sc.name}」은(는) ${party.min}명 이상이 함께해야 합니다.` }
    if (present.length > party.max) return { ok: false, error: `「${sc.name}」은(는) 최대 ${party.max}명까지 함께할 수 있습니다.` }

    this.members = present
    this.gameNo += 1
    this.sgame = createScenarioGame(sc, {
      seed: randomBytes(4).readUInt32BE(0),
      players: present.map((m) => ({ id: m.id, name: m.name, archetype: m.archetype })),
    })
    this.sceneKey = this.keyOf()
    this.touch()
    this.broadcast()
    return { ok: true, value: true }
  }

  /**
   * 방장 전용, 엔딩 뒤: 같은 방의 대기실로 돌아간다. 접속해 있는 사람만 남고(나가거나 끊긴 사람은 정리),
   * 빈 자리에는 새로 들어올 수 있다. 방장이 대상을 다시 고르고 시작하면 새 게임이 된다.
   */
  rematch(by: Member): Result<true> {
    if (this.sgame?.run.phase !== 'ended') return { ok: false, error: '엔딩 뒤에만 다시 할 수 있습니다.' }
    if (by.id !== this.hostId) return { ok: false, error: '방장만 다시 시작할 수 있습니다.' }
    this.members = this.members.filter((m) => m.send && !m.left)
    this.sgame = null
    this.reading.clear()
    this.sceneKey = ''
    this.touch()
    this.broadcast()
    return { ok: true, value: true }
  }

  /** 게임 중의 행동 */
  sact(member: Member, action: ScenarioClientAction): void {
    this.commitScenario({ ...action, playerId: member.id } as ScenarioAction)
  }

  /** 방장 전용, 엔딩 뒤: 같은 대상으로 새 판 (단서 노트·닿은 엔딩은 남는다) */
  retry(by: Member): Result<true> {
    if (!this.sgame || this.sgame.run.phase !== 'ended') return { ok: false, error: '엔딩 뒤에만 다시 도전할 수 있습니다.' }
    if (by.id !== this.hostId) return { ok: false, error: '방장만 다시 도전할 수 있습니다.' }
    this.gameNo += 1
    this.commitScenario({ type: 'retry' })
    return { ok: true, value: true }
  }

  /** 방장 전용: 안 고른 사람을 기다리지 않고 진행 (동률 투표는 방장의 표를 따른다) */
  force(by: Member): void {
    if (by.id !== this.hostId) return
    this.commitScenario({ type: 'force', tieBreak: by.id })
  }

  setReading(member: Member, reading: boolean): void {
    if (!this.sgame || this.sgame.run.phase === 'ended') return
    const had = this.reading.has(member.id)
    if (reading === had) return
    if (reading) this.reading.add(member.id)
    else this.reading.delete(member.id)
    this.broadcast()
  }

  private keyOf(): string {
    const s = this.sgame
    return s ? `${s.runNo}|${s.run.nodeId}|${s.run.phase}` : ''
  }

  private noteScene(): void {
    // 장면이 바뀌면 "읽는 중"은 처음부터 다시 센다 (각 클라이언트가 새 장면에서 다시 알린다)
    const key = this.keyOf()
    if (key !== this.sceneKey) {
      this.sceneKey = key
      this.reading.clear()
    }
  }

  private commitScenario(action: ScenarioAction): void {
    const g = this.sgame
    const sc = g && findScenario(g.scenarioId)
    if (!g || !sc) return
    try {
      const next = reduceScenario(sc, g, action)
      if (next === g) return
      this.sgame = next
    } catch (error) {
      // 시나리오 작성 오류(어느 길에도 안 맞음 등)가 서버를 죽이지 않게 한다
      console.error(`[${this.code}] 시나리오 처리 중 오류:`, error)
      return
    }
    this.noteScene()
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
      const g = this.sgame
      const sc = g && findScenario(g.scenarioId)
      if (!g || !sc || g.run.phase === 'ended') return
      const run = g.run
      const online = new Set(this.members.filter((m) => m.send).map((m) => m.id))
      if (online.size === 0) return
      const here = run.players.filter((p) => online.has(p.id))

      let stuck = false
      switch (run.phase) {
        case 'story':
        case 'result':
          stuck = here.every((p) => run.ready.includes(p.id))
          break
        case 'vote': {
          // 접속 중인 사람이 다 골랐고 한 표 차이로 갈리는 동률이 아닐 때만 (동률은 의논해서 모아야 한다)
          const who = here.filter((p) => !isPanicked(p))
          if (who.length === 0 || !who.every((p) => run.votes[p.id])) break
          const counts = new Map<string, number>()
          for (const p of who) counts.set(run.votes[p.id], (counts.get(run.votes[p.id]) ?? 0) + 1)
          const top = Math.max(...counts.values())
          stuck = [...counts.values()].filter((n) => n === top).length === 1
          break
        }
        case 'split': {
          const node = currentNode(sc, g)
          if (node.kind !== 'split') break
          const pickers = splitPickers(g, node).filter((p) => online.has(p.id))
          stuck = pickers.length > 0 && pickers.every((p) => run.picks[p.id])
          break
        }
        case 'personal':
          // 고르는 중이면 접속 중인 사람이 다 골랐을 때, 적용된 뒤에는 다 끝났을 때
          stuck = here.every((p) => {
            const prog = run.personal[p.id]
            return prog?.done || (!prog?.committed && prog?.pick)
          })
          break
      }
      if (!stuck) return
      try {
        const next = reduceScenario(sc, g, { type: 'force', tieBreak: this.hostId })
        if (next === g) return
        this.sgame = next
      } catch (error) {
        console.error(`[${this.code}] 시나리오 처리 중 오류:`, error)
        return
      }
      this.noteScene()
    }
  }

  // ───────────── 전송 ─────────────

  broadcast(): void {
    for (const m of this.members) {
      if (m.send) m.send(this.messageFor(m))
    }
  }

  messageFor(m: Member): ServerMsg {
    const sc = this.sgame && findScenario(this.sgame.scenarioId)
    if (this.sgame && sc) {
      return {
        t: 'sstate',
        code: this.code,
        gameId: `${this.code}-${this.gameNo}`,
        hostId: this.hostId,
        online: Object.fromEntries(this.members.map((x) => [x.id, !!x.send])),
        reading: [...this.reading],
        view: viewForScenario(sc, this.sgame, m.id),
      }
    }
    return {
      t: 'lobby',
      code: this.code,
      you: m.id,
      hostId: this.hostId,
      members: this.members.map((x) => ({ id: x.id, name: x.name, online: !!x.send, archetype: x.archetype })),
      mode: this.mode,
      modes: lobbyModes(),
    }
  }

  private touch(): void {
    this.lastActivity = Date.now()
  }
}
