// 사용: npm run sim -- [판 수] [시드]
import { context } from '../src/content/index.ts'
import { simulate, type BotPolicy } from '../src/engine/simulate.ts'

const games = Number(process.argv[2] ?? 500)
const seed = Number(process.argv[3] ?? 1)
const policies: BotPolicy[] = ['random', 'safe', 'bold']

console.log(`${games}판 · 시드 ${seed}부터 · 대상 ${context.entities.length}종\n`)
for (const playerCount of [1, 2, 4]) {
  for (const policy of policies) {
    const r = simulate(context, { games, playerCount, policy, seed, maxMonths: 80 })
    const pct = (n: number) => `${((n / games) * 100).toFixed(0)}%`
    console.log(
      `${playerCount}인 ${policy.padEnd(6)} | 붕괴 ${pct(r.endings.collapse).padStart(4)} · 진실 ${pct(r.endings.truth).padStart(4)} · 탈출 ${pct(r.endings.escape).padStart(4)} · 미종료 ${pct(r.endings.timeout).padStart(4)} | 평균 ${r.avgMonths.toFixed(1)}달 · 사망 ${r.avgDeaths.toFixed(1)}명 · 조각 ${r.avgFragments.toFixed(1)}`,
    )
  }
}
