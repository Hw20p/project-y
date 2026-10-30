// 보기 문구 변형: 같은 뜻의 말을 판마다 다르게 보인다. 판이 시작될 때 시드로 `wording`(a·b·c) 하나가 뽑히고, 그 말투의 문구만 나온다.
// 추리 보기의 **문구로 정답을 외워 두는 것**을 막으려는 장치다 — 뜻과 정답은 그대로이고 말투와 고르는 말만 달라진다.
// 정답만 바꾸면 "아는 문구를 지우고 남는 것"으로 맞힐 수 있으므로 오답도 함께 바꾼다. 쓰는 시나리오는 `vars`에 `WORDING_VAR`를 넣는다.
import type { Text } from '../../scenario/types.ts'

export const WORDINGS = ['a', 'b', 'c'] as const

/** 시나리오의 `vars`에 넣는 무작위 값 */
export const WORDING_VAR = { id: 'wording', pick: [...WORDINGS] }

/** 세 가지 말투 중 이번 판의 것 하나만 보이는 글 */
export const say = (a: string, b: string, c: string): Text =>
  [a, b, c].map((text, i) => ({ text, when: { var: 'wording', is: WORDINGS[i] } }))
