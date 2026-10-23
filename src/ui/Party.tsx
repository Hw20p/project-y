import type { GameView } from '../engine/view.ts'

/** 파티원 줄: 누가 살아 있고, 누가 읽는 중이고, 누가 골랐고, 누가 계속을 눌렀는지 */
export function Party({
  view,
  reading,
  online,
}: {
  view: GameView
  reading: string[]
  /** 온라인 방에서만: 플레이어 id → 접속 중인지 */
  online?: Record<string, boolean>
}) {
  const waitingOnChoice = view.phase === 'vote' || view.phase === 'night'
  const waitingOnReady = view.phase === 'briefing' || view.phase === 'result'

  return (
    <ul className="flex flex-wrap gap-2 py-3" aria-label="파티원">
      {view.players.map((p) => {
        const isMe = p.id === view.me.id
        let tag = ''
        let tone = 'text-ash'
        if (online && online[p.id] === false) {
          tag = '연결 끊김'
          tone = 'text-amber'
        } else if (!p.alive) {
          tag = '쓰러짐'
          tone = 'text-loss'
        } else if (waitingOnChoice) {
          // 읽는 중이어도 이미 골랐다면(다시 읽는 중) 선택함이 우선
          if (p.acted) {
            tag = '선택함'
            tone = 'text-gain'
          } else if (reading.includes(p.id)) {
            tag = '읽는 중'
            tone = 'text-glow'
          } else {
            tag = '고민 중'
          }
        } else if (waitingOnReady) {
          if (p.ready) {
            tag = '준비'
            tone = 'text-gain'
          } else if (reading.includes(p.id)) {
            tag = '읽는 중'
            tone = 'text-glow'
          } else {
            tag = '대기'
          }
        }
        return (
          <li
            key={p.id}
            className={`flex items-center gap-2 rounded border px-2.5 py-1 text-[13px] sm:text-xs ${
              isMe ? 'border-glow/40 bg-glow/5' : 'border-edge bg-panel'
            } ${p.alive ? 'text-bone' : 'text-ash line-through decoration-loss/60'}`}
          >
            <span>{p.name}</span>
            {tag && <span className={`no-underline ${tone}`}>{tag}</span>}
          </li>
        )
      })}
    </ul>
  )
}
