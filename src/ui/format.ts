import { context } from '../content/index.ts'
import type { Beat } from '../engine/types.ts'

export const BEAT_LABEL: Record<Beat, string> = { day: '낮', night: '밤', decision: '결정' }
export const BEAT_MARK: Record<Beat, string> = { day: '☀', night: '☾', decision: '◆' }

export const itemName = (id: string): string => context.items.find((i) => i.id === id)?.name ?? id
export const hintText = (id: string): string => context.hints.find((h) => h.id === id)?.text ?? id

export const DECISION_LABEL = { release: '방생', contain: '격리', terminate: '처리' } as const

/** "+3" / "-2" 같은 부호 붙은 수 */
export const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)
