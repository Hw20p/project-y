// 서버 실행: npm run server  (포트는 PORT 환경 변수, 기본 8787. HOST를 정하면 그 주소로만 받는다 — 배포에서는 127.0.0.1)
import { startServer } from './index.ts'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST || undefined
const server = await startServer(port, host)
console.log(`Project-Y 서버가 ws://${host ?? 'localhost'}:${server.port} 에서 기다리는 중`)

// 서비스가 멈출 때(재배포 등) 연결을 정리하고 끝난다
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0))
  })
}
