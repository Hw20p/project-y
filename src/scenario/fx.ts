// 본문 글자 연출 표기. 글 안에 `[[효과|글자]]`를 쓰면 그 글자에만 효과가 입혀진다. (화면이 아니면 효과 표기를 벗겨 낸 글만 쓴다.)
//   shake   : 떨리는 붉은 글자 (공포·충격)
//   whisper : 작고 흐린 기울임 (속삭임·먼 소리)
//   flicker : 깜빡이는 글자 (꺼져 가는 불빛)
//   loud    : 굵고 환한 글자 (또렷한 한마디)
//   cold    : 푸르게 식은 글자 (차가운 것)

export const FX_NAMES = ['shake', 'whisper', 'flicker', 'loud', 'cold'] as const
export type FxName = (typeof FX_NAMES)[number]

export interface FxSpan {
  start: number
  end: number
  fx: string
}

const FX_RE = /\[\[(\w+)\|([^\]]*)\]\]/g

/** 효과 표기를 걷어 내고, 효과가 걸린 글자의 범위를 돌려준다 */
export function parseFx(raw: string): { plain: string; spans: FxSpan[] } {
  const spans: FxSpan[] = []
  let plain = ''
  let last = 0
  for (const m of raw.matchAll(FX_RE)) {
    plain += raw.slice(last, m.index)
    spans.push({ start: plain.length, end: plain.length + m[2].length, fx: m[1] })
    plain += m[2]
    last = m.index + m[0].length
  }
  return { plain: plain + raw.slice(last), spans }
}

/** 효과 표기를 벗긴 글 (지난 기록처럼 효과를 못 쓰는 곳용) */
export const stripFx = (raw: string): string => parseFx(raw).plain

/** 글에 쓰인 효과 이름들 (검증용) */
export const fxNamesIn = (raw: string): string[] => [...raw.matchAll(FX_RE)].map((m) => m[1])
