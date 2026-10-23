import { context } from '../src/content/index.ts'
import { validateContent } from '../src/engine/validate.ts'

const { errors, warnings } = validateContent(context)
for (const w of warnings) console.log(`경고: ${w}`)
for (const e of errors) console.log(`에러: ${e}`)
console.log(`대상 ${context.entities.length}개 · 에러 ${errors.length} · 경고 ${warnings.length}`)
process.exit(errors.length > 0 ? 1 : 0)
