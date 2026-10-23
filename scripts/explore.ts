// 전수 탐색: npm run explore -- [시나리오 id] [인원들, 예: 2,3] [--full]  (--full: 무작위 값 조합을 전부)
// 모든 엔딩에 닿는지, 갇히는 상태가 없는지 확인한다. 문제가 있으면 종료 코드 1.
import { exploreScenario, formatReport } from '../src/scenario/explore.ts'
import { partyOf, partySizes, scenarios } from '../src/scenario/registry.ts'
import { validateScenario } from '../src/scenario/validate.ts'

const args = process.argv.slice(2)
const full = args.includes('--full')
const positional = args.filter((a) => !a.startsWith('--'))
const only = positional.find((a) => !/^[\d,]+$/.test(a))
const sizesArg = positional.find((a) => /^[\d,]+$/.test(a))
const wanted = sizesArg?.split(',').map(Number)

let failed = false
for (const sc of scenarios) {
  if (only && sc.id !== only) continue
  const staticReport = validateScenario(sc)
  for (const e of staticReport.errors) console.log(`정적 검증 에러: ${e}`)
  if (staticReport.errors.length > 0) failed = true

  for (const n of wanted ?? partySizes(sc)) {
    const report = exploreScenario(sc, { players: partyOf(n), full })
    const { ok, text } = formatReport(sc, report)
    console.log(text)
    if (!ok) failed = true
  }
  console.log()
}
process.exit(failed ? 1 : 0)
