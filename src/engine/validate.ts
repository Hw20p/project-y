// 콘텐츠 형식 검증. 에러는 게임이 깨지는 것, 경고는 이상해 보이는 것.
import { CONFIG, MONTH_BEATS } from './config.ts'
import type { Choice, GameContext, Outcome } from './types.ts'

export interface ValidationReport {
  errors: string[]
  warnings: string[]
}

export function validateContent(ctx: GameContext): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []

  const itemIds = new Set(ctx.items.map((i) => i.id))
  const hintIds = new Set(ctx.hints.map((h) => h.id))
  const grantedHints = new Set<string>()
  const grantedItems = new Set<string>()
  let totalFragments = 0

  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label}: id 중복 "${id}"`)
      seen.add(id)
    }
  }
  unique('대상', ctx.entities.map((e) => e.id))
  unique('아이템', ctx.items.map((i) => i.id))
  unique('단서', ctx.hints.map((h) => h.id))

  for (const id of CONFIG.ESCAPE_ITEMS) {
    if (!itemIds.has(id)) errors.push(`탈출 아이템 "${id}"이(가) 정의되어 있지 않음`)
  }

  const checkOutcome = (where: string, o: Outcome) => {
    if (!o.text.trim()) errors.push(`${where}: 결과 문장이 비어 있음`)
    for (const id of o.grant?.items ?? []) {
      if (!itemIds.has(id)) errors.push(`${where}: 알 수 없는 아이템 "${id}"`)
      grantedItems.add(id)
    }
    for (const id of o.grant?.hints ?? []) {
      if (!hintIds.has(id)) errors.push(`${where}: 알 수 없는 단서 "${id}"`)
      grantedHints.add(id)
    }
    totalFragments += o.grant?.fragments ?? 0
  }

  const checkChoice = (where: string, c: Choice) => {
    if (c.baseChance < CONFIG.MIN_CHANCE || c.baseChance > CONFIG.MAX_CHANCE) {
      errors.push(`${where}: baseChance ${c.baseChance}가 범위 밖`)
    }
    if (c.requiresItem && !itemIds.has(c.requiresItem)) errors.push(`${where}: 알 수 없는 requiresItem "${c.requiresItem}"`)
    for (const b of c.boosts ?? []) {
      if (!itemIds.has(b.item)) errors.push(`${where}: 알 수 없는 boost 아이템 "${b.item}"`)
    }
    for (const h of c.hints ?? []) {
      if (!hintIds.has(h.hint)) errors.push(`${where}: 알 수 없는 단서 "${h.hint}"`)
    }
    if (!c.text.trim()) errors.push(`${where}: 선택지 문장이 비어 있음`)
    checkOutcome(`${where} 성공`, c.success)
    checkOutcome(`${where} 실패`, c.failure)
  }

  const needsAlwaysAvailable = (where: string, choices: Choice[]) => {
    if (!choices.some((c) => !c.requiresItem)) errors.push(`${where}: 조건 없이 고를 수 있는 선택지가 없음`)
    unique(where, choices.map((c) => c.id))
  }

  const dayBeats = MONTH_BEATS.filter((b) => b === 'day').length

  for (const e of ctx.entities) {
    if (e.dayEvents.length < dayBeats) {
      errors.push(`${e.code}: 낮 이벤트가 ${dayBeats}개 이상 필요함 (지금 ${e.dayEvents.length}개)`)
    }
    unique(`${e.code} 낮 이벤트`, e.dayEvents.map((d) => d.id))
    for (const d of e.dayEvents) {
      if (d.choices.length < 2) errors.push(`${e.code}/${d.id}: 선택지가 2개 이상 필요함`)
      needsAlwaysAvailable(`${e.code}/${d.id}`, d.choices)
      d.choices.forEach((c) => checkChoice(`${e.code}/${d.id}/${c.id}`, c))
    }

    needsAlwaysAvailable(`${e.code}/밤`, e.night.choices)
    if (e.night.choices.filter((c) => !c.requiresItem).length < CONFIG.NIGHT_DEAL) {
      warnings.push(`${e.code}/밤: 조건 없는 선택지가 ${CONFIG.NIGHT_DEAL}개보다 적어 사람마다 받는 목록이 같아짐`)
    }
    e.night.choices.forEach((c) => checkChoice(`${e.code}/밤/${c.id}`, c))

    const kinds = e.decisions.map((d) => d.kind).sort().join(',')
    if (kinds !== 'contain,release,terminate') errors.push(`${e.code}: 결정은 방생·격리·처리 각각 하나씩이어야 함 (지금 ${kinds})`)
    needsAlwaysAvailable(`${e.code}/결정`, e.decisions)
    e.decisions.forEach((c) => checkChoice(`${e.code}/결정/${c.id}`, c))

    for (const text of [...e.observation, ...e.manual]) {
      if (!text.trim()) errors.push(`${e.code}: 관찰 기록/매뉴얼에 빈 문장`)
    }
  }

  for (const id of itemIds) {
    if (!grantedItems.has(id)) warnings.push(`아이템 "${id}"을(를) 주는 곳이 없음`)
  }
  for (const id of hintIds) {
    if (!grantedHints.has(id)) warnings.push(`단서 "${id}"을(를) 주는 곳이 없음`)
  }
  if (totalFragments < CONFIG.TRUTH_FRAGMENTS) {
    errors.push(`진실 조각이 모두 ${totalFragments}개뿐이라 진엔딩 기준 ${CONFIG.TRUTH_FRAGMENTS}개에 닿을 수 없음`)
  }

  return { errors, warnings }
}
