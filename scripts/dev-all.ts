// 개발용: 게임 서버(8787)와 화면 개발 서버(5174)를 한 번에 띄운다.  npm run dev:all
import { spawn, type ChildProcess } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children: ChildProcess[] = []

function run(label: string, script: string): void {
  const child = spawn(npm, ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' })
  children.push(child)
  child.on('exit', (code) => {
    console.log(`[${label}] 종료 (${code})`)
    stopAll()
  })
}

let stopping = false
function stopAll(): void {
  if (stopping) return
  stopping = true
  for (const c of children) c.kill()
  setTimeout(() => process.exit(0), 300)
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)

run('서버', 'server')
run('화면', 'dev')
