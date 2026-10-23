// 서버 실행: npm run server  (포트는 PORT 환경 변수, 기본 8787)
import { startServer } from './index.ts'

const port = Number(process.env.PORT ?? 8787)
const server = await startServer(port)
console.log(`Project-Y 서버가 ws://localhost:${server.port} 에서 기다리는 중`)
