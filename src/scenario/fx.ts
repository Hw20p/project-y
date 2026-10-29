// 본문 글자 연출 표기. 글 안에 `[[효과|글자]]`를 쓰면 그 글자에만 효과가 입혀진다. (화면이 아니면 효과 표기를 벗겨 낸 글만 쓴다.)
//   shake   : 떨리는 붉은 글자 (공포·충격)
//   whisper : 작고 흐린 기울임 (속삭임·먼 소리)
//   flicker : 깜빡이는 글자 (꺼져 가는 불빛)
//   loud    : 굵고 환한 글자 (또렷한 한마디)
//   cold    : 푸르게 식은 글자 (차가운 것)
//   echo    : 잠시 뒤 같은 글자가 한 번 더 따라 나오는 메아리 (되풀이되는 것, 한 명 더)
//   mirror  : 뒤집힌 거울상이 뒤따라 붙는 글자 (거울, 비치는 것)
//   redact  : 검은 줄로 가려진 글자. 정신력이 낮아지면 가려진 것이 읽힌다 (알아서는 안 되는 것)

export const FX_NAMES = ['shake', 'whisper', 'flicker', 'loud', 'cold', 'echo', 'mirror', 'redact'] as const
export type FxName = (typeof FX_NAMES)[number]

/**
 * 엔딩 하나에만 붙는 화면 연출 (엔딩 노드의 `fx`). 등급별 배경(피·안개·빛)에 더해, 그 엔딩이 이야기 속 소재를 화면으로 가져온다.
 *   phantom : 엔딩 화면에 파티 카드가 나오고, 없던 한 명이 서서히 늘어난다 ("인원 N+1")
 *   tally   : 파티 카드가 진열된 상품처럼 정리되고 정신력이 동전처럼 떨어진다 (정산)
 */
export const ENDING_FX_NAMES = ['phantom', 'tally'] as const
export type EndingFxName = (typeof ENDING_FX_NAMES)[number]

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
