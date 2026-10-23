// 화면이 게임과 주고받는 것의 모양.
import { createContext } from 'react'
import type { ScenarioClientAction } from '../net/protocol.ts'
import type { ScenarioView } from '../scenario/view.ts'

/** 서술 연출이 "읽는 중"을 보고할 때 쓰는 함수. 제공되지 않으면 보고하지 않는다. */
export const ReadingContext = createContext<((reading: boolean) => void) | null>(null)

/** 시나리오 모드 화면이 게임과 주고받는 것의 모양 (온라인 방에서만 쓴다) */
export interface ScenarioClient {
  view: ScenarioView
  send: (action: ScenarioClientAction) => void
  /** 지금 서술을 읽고 있는 사람들 (일시적 접속 정보) */
  reading: string[]
  setReading: (reading: boolean) => void
  online: Record<string, boolean>
  roomCode: string
  isHost: boolean
  reconnecting: boolean
  /** 이 판의 지난 기록을 브라우저에 저장할 때 쓰는 이름 */
  journalKey: string
  /** 방장 전용: 안 고른 사람을 기다리지 않고 진행 (동률 투표는 방장의 표를 따른다) */
  force?: () => void
  /** 방장 전용, 엔딩 뒤: 같은 대상으로 새 판 (단서 노트는 남는다) */
  retry?: () => void
  /** 방장 전용, 엔딩 뒤: 대기실로 돌아가 대상·입사 배경을 다시 고른다 */
  rematch?: () => void
}
