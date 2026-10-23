// 화면이 게임과 주고받는 것의 모양. 로컬 어댑터(useLocalGame)와 나중의 서버 어댑터가 같은 모양을 돌려준다.
import { createContext } from 'react'
import type { ClientAction, GameView } from '../engine/view.ts'

export interface GameClient {
  view: GameView
  send: (action: ClientAction) => void
  /**
   * 지금 서술을 읽고 있는 사람들의 id. 게임 상태가 아니라 **일시적인 접속 정보**다:
   * 저장하지 않고, 규칙(reduce)에는 영향을 주지 않으며, 서버는 받은 대로 파티원에게 전달만 한다.
   */
  reading: string[]
  /** 내가 지금 서술을 읽는 중인지 알린다 (서술이 다 흐르면 false) */
  setReading: (reading: boolean) => void
  /** 온라인 방일 때만: 플레이어 id → 접속 중인지 */
  online?: Record<string, boolean>
  /** 온라인 방일 때만: 방 코드 */
  roomCode?: string
  /** 온라인 방일 때만: 내가 방장인지 */
  isHost?: boolean
  /** 온라인 방일 때만: 연결이 일시적으로 끊겨 다시 붙는 중인지 */
  reconnecting?: boolean
  /** 방장 전용: 안 고른 사람을 기다리지 않고 진행 */
  force?: () => void
}

/** 서술 연출이 "읽는 중"을 보고할 때 쓰는 함수. 제공되지 않으면 보고하지 않는다. */
export const ReadingContext = createContext<((reading: boolean) => void) | null>(null)
