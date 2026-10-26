// 조사 보드: 지금 무엇을 해야 하고(목표), 무엇이 풀렸고, 파티가 알아낸 단서가 어느 의문에 붙는지(누가 얻었는지 이름과 함께)를 한눈에 보인다.
import type { BoardView, ScenarioView } from '../../scenario/view.ts'
import { clueWho } from './parts.tsx'

/** 화면 위에 늘 보이는 한 줄: 목표와 진행 */
export function BoardStrip({ board, onOpen }: { board: BoardView; onOpen: () => void }) {
  const solved = board.questions.filter((q) => q.solved).length
  const seen = board.questions.filter((q) => q.text !== null).length
  const current = board.questions.find((q) => q.current)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-3 w-full rounded border border-edge bg-panel/50 px-3 py-2 text-left hover:border-fog/50"
    >
      <span className="flex items-baseline justify-between gap-3 text-[11px] tracking-widest text-ash">
        <span>조사 보드 · 목표</span>
        <span>
          풀린 의문 <span className={solved === board.questions.length ? 'text-gain' : 'text-bone'}>{solved}</span>/{board.questions.length}
          {seen < board.questions.length && <span className="ml-1.5 text-ash/70">(발견 {seen})</span>}
        </span>
      </span>
      <span className="mt-1 block font-serif-kr text-sm leading-6 text-fog">{board.goal}</span>
      {current?.text && (
        <span className="mt-1.5 block font-serif-kr text-sm leading-6 text-amber">
          <span className="mr-1.5 text-xs tracking-widest text-ash">지금 과제</span>
          {current.text}
        </span>
      )}
    </button>
  )
}

/** 정보 패널의 조사 보드 탭 */
export function BoardPanel({ board, view }: { board: BoardView; view: ScenarioView }) {
  const hidden = board.questions.filter((q) => q.text === null).length
  return (
    <div>
      <p className="text-xs tracking-widest text-ash">목표</p>
      <p className="mt-1 font-serif-kr leading-7 text-bone">{board.goal}</p>

      <ul className="mt-5 space-y-4">
        {board.questions.map((q) =>
          q.text === null ? null : (
            <li
              key={q.id}
              className={`rounded border p-3 ${q.solved ? 'border-gain/40 bg-gain/5' : q.current ? 'border-amber/50 bg-amber/5' : 'border-edge bg-panel/40'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-serif-kr text-[15px] leading-6">{q.text}</h3>
                <span className={`shrink-0 text-xs ${q.solved ? 'text-gain' : 'text-amber'}`}>
                  {q.solved ? '풀림' : q.current ? '지금 과제' : '미해결'}
                </span>
              </div>
              {q.answer && <p className="mt-2 border-l-2 border-gain/50 pl-3 font-serif-kr text-sm leading-7 text-bone">{q.answer}</p>}
              {q.clues.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {q.clues.map((c) => (
                    <li key={c.id} className={`font-serif-kr text-sm leading-7 ${c.old ? 'text-ash' : 'text-glow'}`}>
                      ◆ {c.text}
                      {c.old ? (
                        <span className="ml-1.5 text-xs">(지난 판)</span>
                      ) : (
                        <span className="ml-2 font-sans text-xs text-ash">{clueWho(c.by, view)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-ash">아직 없다.</p>
              )}
            </li>
          ),
        )}
      </ul>

      {hidden > 0 && (
        <p className="mt-4 rounded border border-dashed border-edge/70 px-3 py-2 text-xs text-ash">
          <span aria-hidden>? </span>드러나지 않은 의문 {hidden}개
        </p>
      )}
    </div>
  )
}
