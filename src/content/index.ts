// 콘텐츠 묶음. Node(서버·스크립트)에서도 그대로 돌아가도록 import.meta.glob 대신 정적으로 가져온다.
// 대상을 추가하면 아래 목록에 한 줄 넣는다.
import type { GameContext } from '../engine/types.ts'
import a01 from './entities/a01-lullaby.ts'
import a02 from './entities/a02-b7-lobby.ts'
import a03 from './entities/a03-vending.ts'
import a04 from './entities/a04-wish-clerk.ts'
import a05 from './entities/a05-roof-garden.ts'
import { hints, items } from './items.ts'

export const context: GameContext = {
  entities: [a01, a02, a03, a04, a05],
  items,
  hints,
}
