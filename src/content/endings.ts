import type { EndingId } from '../engine/state.ts'

export interface EndingText {
  title: string
  text: string
}

export const endings: Record<EndingId, EndingText> = {
  collapse: {
    title: '붕괴',
    text: '경보가 울리지 않은 지 오래였다. 어느 날 모든 문이 같은 방향으로 열렸고, 복도의 불빛은 한꺼번에 한 층씩 꺼졌다. 시설이 대상들을 가둬 두던 것이 아니라 대상들이 시설을 견디고 있었다는 사실을, 마지막까지 남은 사람들은 조금 늦게 알았다.',
  },
  truth: {
    title: '진실 (임시)',
    text: '모은 조각들이 한 장의 도면으로 맞춰졌다. 모든 대상은 같은 방향을 가리키고 있었다. 그 끝에 무엇이 있는지는 아직 쓰이지 않았다. (진엔딩은 자리표시자입니다.)',
  },
  escape: {
    title: '탈출',
    text: '보안 카드가 마지막 문의 단말기에 닿았다. 짧은 신호음. 뒤에서는 아직 아무도 쫓아오지 않았다. 권총의 무게를 느끼며 한 사람씩 계단을 올랐다. 바깥은 생각보다 밝았다.',
  },
}
