import type { HintDef, ItemDef } from '../engine/types.ts'

export const items: ItemDef[] = [
  { id: 'earplug', name: '밀랍 귀마개', text: '소리를 완전히 막지는 못하지만, 노랫가락을 한 박자 늦춰 준다.' },
  { id: 'lantern', name: '청동 손전등', text: '빛이 닿는 곳은 계단이 계단처럼 보인다.' },
  { id: 'token', name: '자판기 토큰', text: '구멍이 뚫린 금속 조각. 넣으면 무언가 나오고, 돌려받을 수도 있다.' },
  { id: 'vest', name: '방호복', text: '한 번은 막아 준다. 한 번뿐이다.', protects: true },
  { id: 'keycard', name: '보안 카드', text: '등급이 지워진 카드. 출입문 몇 개는 이걸로 열린다.', keep: true },
  { id: 'sidearm', name: '권총', text: '허가된 적 없는 무게. 탄창에는 아직 총알이 있다.', keep: true },
]

export const hints: HintDef[] = [
  { id: 'song-breath', text: '하나의 자장가는 세 번째 마디에서 숨을 쉰다. 그 순간에는 소리가 끊긴다.' },
  { id: 'song-name', text: '하나는 자기 이름을 불러 주는 사람을 해치지 않는다.' },
  { id: 'b7-nobutton', text: 'B7 엘리베이터는 층 버튼을 누르지 않았을 때만 "없는 층"에서 선다.' },
  { id: 'b7-count', text: '계단은 센 숫자보다 하나 적게 내려가야 한다. 맞게 세면 내려갈 수 없다.' },
  { id: 'vend-memory', text: '자판기는 돈이 아니라 기억을 값으로 받는다. 아끼는 기억일수록 거스름돈이 크다.' },
  { id: 'vend-token', text: '동전은 돌아오지 않지만 토큰은 돌려받을 수 있다.' },
]
