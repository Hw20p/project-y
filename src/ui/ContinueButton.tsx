import type { ClientAction, GameView } from '../engine/view.ts'

/**
 * 모두가 눌러야 넘어가는 "계속" 버튼 (briefing·result 공용).
 * 모바일에서는 화면 아래에 붙은 막대로 떠서, 긴 글을 읽은 뒤 스크롤 없이 바로 누를 수 있다.
 */
export function ContinueButton({
  view,
  send,
  label = '계속',
}: {
  view: GameView
  send: (a: ClientAction) => void
  label?: string
}) {
  const me = view.players.find((p) => p.id === view.me.id)!
  const readyCount = view.players.filter((p) => p.ready).length

  return (
    <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-void via-void/95 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-5 sm:static sm:mx-0 sm:bg-none sm:p-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={me.ready}
          onClick={() => send({ type: 'ready' })}
          className="flex-1 rounded border border-glow/50 bg-glow/10 px-5 py-3 text-sm text-glow transition hover:bg-glow/20 disabled:cursor-default disabled:border-edge disabled:bg-transparent disabled:text-ash sm:flex-none sm:py-2"
        >
          {me.ready ? '다른 사람을 기다리는 중' : label}
        </button>
        {view.players.length > 1 && (
          <span className="text-xs text-ash">
            {readyCount}/{view.players.length}
          </span>
        )}
        {!me.ready && <span className="kbd-hint text-xs text-ash">Enter</span>}
      </div>
    </div>
  )
}
