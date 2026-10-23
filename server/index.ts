// WebSocket 서버. 방 코드로 방을 만들고 들어오고, 받은 메시지를 방(Room)에 넘겨 준다.
// 상태는 메모리에만 있다: 서버를 다시 켜면 진행 중이던 방은 사라진다.
import { randomInt } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { parseClientMsg, ROOM_CODE_LENGTH, type ServerMsg } from '../src/net/protocol.ts'
import { Room, type Member, type Send } from './room.ts'

/** 헷갈리는 글자(I, O)를 뺀 방 코드 글자 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
/** 아무도 접속해 있지 않은 방을 치우기까지의 시간 */
const ROOM_IDLE_MS = 30 * 60 * 1000
const HEARTBEAT_MS = 25 * 1000

/** 지난 확인(ping)에 응답했는지. 응답이 없는 연결은 끊긴 것으로 보고 정리한다. */
const answered = new WeakMap<WebSocket, boolean>()

export interface RunningServer {
  port: number
  rooms: Map<string, Room>
  close: () => Promise<void>
}

function newCode(rooms: Map<string, Room>): string {
  for (;;) {
    let code = ''
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)]
    if (!rooms.has(code)) return code
  }
}

export function startServer(port: number): Promise<RunningServer> {
  const rooms = new Map<string, Room>()
  const wss = new WebSocketServer({ port })

  wss.on('connection', (socket: WebSocket) => {
    const send: Send = (msg: ServerMsg) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
    }
    let room: Room | null = null
    let member: Member | null = null

    answered.set(socket, true)
    socket.on('pong', () => answered.set(socket, true))

    const enter = (r: Room, m: Member) => {
      room = r
      member = m
      send({ t: 'joined', code: r.code, playerId: m.id, token: m.token })
      r.broadcast()
    }

    socket.on('message', (data) => {
      const msg = parseClientMsg(data.toString())
      if (!msg) return

      switch (msg.t) {
        case 'create': {
          if (room) return send({ t: 'error', message: '이미 방에 들어와 있습니다.' })
          const r = new Room(newCode(rooms))
          const joined = r.join(msg.name, send)
          if (!joined.ok) return send({ t: 'error', message: joined.error })
          rooms.set(r.code, r)
          enter(r, joined.value)
          return
        }
        case 'join': {
          if (room) return send({ t: 'error', message: '이미 방에 들어와 있습니다.' })
          const r = rooms.get(msg.code.trim().toUpperCase())
          if (!r) return send({ t: 'error', message: '그런 방이 없습니다. 코드를 확인해 주세요.' })
          const joined = r.join(msg.name, send)
          if (!joined.ok) return send({ t: 'error', message: joined.error })
          enter(r, joined.value)
          return
        }
        case 'rejoin': {
          if (room) return
          const r = rooms.get(msg.code.trim().toUpperCase())
          if (!r) return send({ t: 'error', message: '방이 사라졌습니다.' })
          const back = r.rejoin(msg.token, send)
          if (!back.ok) return send({ t: 'error', message: back.error })
          room = r
          member = back.value
          send({ t: 'joined', code: r.code, playerId: back.value.id, token: back.value.token })
          r.broadcast()
          return
        }
      }

      if (!room || !member) return
      switch (msg.t) {
        case 'start': {
          const started = room.start(member)
          if (!started.ok) send({ t: 'error', message: started.error })
          return
        }
        case 'action':
          room.act(member, msg.action)
          return
        case 'reading':
          room.setReading(member, msg.reading)
          return
        case 'force':
          room.force(member)
          return
        case 'leave': {
          const r = room
          const m = member
          room = null
          member = null
          r.leave(m)
          return
        }
      }
    })

    socket.on('close', () => {
      if (room && member) room.disconnect(member, send)
    })
    socket.on('error', () => socket.terminate())
  })

  // 끊긴 줄 모르는 연결을 정리하고, 오래 비어 있는 방을 치운다
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (answered.get(client) === false) {
        client.terminate()
        continue
      }
      answered.set(client, false)
      client.ping()
    }
    const now = Date.now()
    for (const [code, r] of rooms) {
      if (r.onlineCount === 0 && now - r.lastActivity > ROOM_IDLE_MS) rooms.delete(code)
    }
  }, HEARTBEAT_MS)

  return new Promise((resolve, reject) => {
    wss.once('error', reject)
    wss.once('listening', () => {
      const address = wss.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({
        port: actualPort,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat)
            for (const client of wss.clients) client.terminate()
            wss.close(() => done())
          }),
      })
    })
  })
}
