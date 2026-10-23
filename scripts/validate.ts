import { scenarios } from '../src/scenario/registry.ts'
import { ARCHETYPES } from '../src/scenario/stats.ts'
import { validateArchetypes, validateScenario } from '../src/scenario/validate.ts'

const errors: string[] = []
const warnings: string[] = []

// 입사 배경과 등록된 시나리오의 정적 검증
for (const e of validateArchetypes(ARCHETYPES)) errors.push(e)
for (const sc of scenarios) {
  const r = validateScenario(sc)
  errors.push(...r.errors)
  warnings.push(...r.warnings)
}
for (const w of warnings) console.log(`경고: ${w}`)
for (const e of errors) console.log(`에러: ${e}`)
const dossier = scenarios.reduce((n, s) => n + (s.dossier?.length ?? 0), 0)
console.log(`시나리오 ${scenarios.length}개 · 자료 ${dossier}개 · 에러 ${errors.length} · 경고 ${warnings.length}`)
process.exit(errors.length > 0 ? 1 : 0)
