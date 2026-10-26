// 시나리오 정보 패널. 위쪽 메뉴는 셋이다: 조사 보드 · 단서·소지품(이번 판 소지품과 알아낸 것, 지난 판까지의 단서 노트) ·
// 자료(대상 정보와 지난 기록, 안에서 전환한다).
import type { ScenarioView } from '../../scenario/view.ts'
import type { JournalEntry } from '../storage.ts'
import { BoardPanel } from './Board.tsx'
import { clueWho } from './parts.tsx'

export type ScenarioTab = 'board' | 'clues' | 'entity' | 'journal'

const TYPE_LABEL: Record<string, string> = { creature: '생명체', place: '장소', object: '물건' }

export function ScenarioDrawer({
  view,
  journal,
  tab,
  onTab,
  onClose,
}: {
  view: ScenarioView
  journal: JournalEntry[]
  tab: ScenarioTab
  onTab: (t: ScenarioTab) => void
  onClose: () => void
}) {
  const e = view.entity
  // 나의 단서: 이번 판에서 내가 얻은 것 + 지난 판에서 단서 노트에 남은 것(이번 판에 다시 얻은 것은 위에 있으므로 뺀다)
  const mine = view.clues.filter((c) => c.by.some((b) => b.id === view.me.id))
  const past = view.notebook.filter((f) => !mine.some((c) => c.id === f.id))
  /** `on`: 이 메뉴가 켜져 있는 것으로 보이는 탭들 (자료는 대상 정보와 지난 기록을 함께 품는다) */
  const tabs: { id: ScenarioTab; label: string; key: string; badge?: number; on: ScenarioTab[] }[] = [
    ...(view.board ? [{ id: 'board' as const, label: '조사 보드', key: 'Q', on: ['board' as const] }] : []),
    { id: 'clues', label: '단서·소지품', key: 'N', badge: view.me.items.length + view.clues.length, on: ['clues'] },
    { id: 'entity', label: '자료', key: 'I', on: ['entity', 'journal'] },
  ]

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="정보">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <aside className="slide-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-edge bg-ink shadow-2xl">
        <div className="flex items-center justify-between gap-1 border-b border-edge px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4">
          <nav className="flex min-w-0 gap-0.5 overflow-x-auto sm:gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className={`shrink-0 rounded px-2.5 py-2.5 text-sm sm:px-3 sm:py-1.5 ${
                  t.on.includes(tab) ? 'bg-glow/15 text-glow' : 'text-fog hover:text-bone'
                }`}
              >
                {t.label}
                {t.badge ? <span className="ml-1 text-xs text-ash">{t.badge}</span> : null}
              </button>
            ))}
          </nav>
          <button type="button" onClick={onClose} className="shrink-0 px-3 py-2.5 text-sm text-ash hover:text-bone sm:py-1">
            닫기 <span className="kbd-hint text-xs">Esc</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {(tab === 'entity' || tab === 'journal') && (
            <div className="mb-5 flex gap-2 text-xs">
              {(
                [
                  ['entity', '대상 정보'],
                  ['journal', '지난 기록'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTab(id)}
                  className={`rounded-full border px-3 py-1 ${
                    tab === id ? 'border-glow/50 bg-glow/10 text-glow' : 'border-edge text-fog hover:text-bone'
                  }`}
                >
                  {label}
                  {id === 'journal' && journal.length > 0 && <span className="ml-1 text-ash">{journal.length}</span>}
                </button>
              ))}
            </div>
          )}

          {tab === 'board' && view.board && <BoardPanel board={view.board} view={view} />}

          {tab === 'entity' && (
            <div>
              <p className="text-xs tracking-widest text-ash">{TYPE_LABEL[e.type] ?? e.type}</p>
              <h2 className="mt-1 font-serif-kr text-2xl font-bold">
                <span className="mr-2 text-ash">{e.code}</span>
                {e.name}
              </h2>
              <p className="mt-3 font-serif-kr leading-8 text-bone">{e.summary}</p>

              <h3 className="mb-2 mt-6 text-xs text-ash">관찰 기록</h3>
              <ul className="space-y-2 font-serif-kr text-sm leading-7 text-fog">
                {e.observation.map((t, i) => (
                  <li key={i}>· {t}</li>
                ))}
              </ul>

              <h3 className="mb-2 mt-6 text-xs text-ash">관리 매뉴얼</h3>
              <ul className="space-y-2 font-serif-kr text-sm leading-7 text-fog">
                {e.manual.map((t, i) => (
                  <li key={i}>· {t}</li>
                ))}
              </ul>

              {e.dossier.length > 0 && (
                <>
                  <h3 className="mb-3 mt-8 border-t border-edge pt-5 text-xs text-ash">
                    자료
                    <span className="ml-2 text-ash/70">
                      {e.dossier.filter((d) => d.lines).length}/{e.dossier.length}
                    </span>
                  </h3>
                  <div className="space-y-5">
                    {e.dossier.map((d) =>
                      d.lines ? (
                        <article key={d.id}>
                          <h4 className="text-sm text-bone">{d.title}</h4>
                          <div className="mt-1 space-y-2 font-serif-kr text-sm leading-7 text-fog">
                            {d.lines.map((l, i) => (
                              <p key={i}>{l}</p>
                            ))}
                          </div>
                        </article>
                      ) : (
                        <article key={d.id} className="rounded border border-dashed border-edge/70 px-3 py-2">
                          <h4 className="text-sm text-ash">
                            <span aria-hidden>🔒 </span>
                            {d.title}
                          </h4>
                          <p className="mt-0.5 text-xs text-ash/80">{d.lockNote}</p>
                        </article>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'clues' && (
            <div className="space-y-5">
              {view.me.items.length === 0 && view.clues.length === 0 && <p className="text-sm text-ash">아직 없다.</p>}
              {view.me.items.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs text-ash">아이템</h3>
                  <ul className="space-y-3">
                    {view.me.items.map((item) => (
                      <li key={item.id}>
                        <span className="text-bone">{item.name}</span>
                        <p className="font-serif-kr text-sm leading-7 text-fog">{item.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {view.clues.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs text-ash">모든 단서</h3>
                  <ul className="space-y-2">
                    {view.clues.map((c) => (
                      <li key={c.id} className="font-serif-kr text-sm leading-7 text-glow">
                        ◆ {c.text}
                        <span className="ml-2 font-sans text-xs text-ash">{clueWho(c.by, view)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'clues' && (
            <div className="mt-8 border-t border-edge pt-6">
              <h3 className="mb-2 text-xs text-ash">나의 단서</h3>
              <ul className="space-y-2">
                {mine.length === 0 && past.length === 0 && <li className="text-sm text-ash">아직 없다.</li>}
                {/* 이번 판에서 내가 얻은 단서, 그리고 지난 판에서 노트에 남은 단서 */}
                {mine.map((c) => (
                  <li key={c.id} className="font-serif-kr text-sm leading-7 text-glow">
                    ◆ {c.text}
                  </li>
                ))}
                {past.map((f) => (
                  <li key={f.id} className="font-serif-kr text-sm leading-7 text-ash">
                    ◆ {f.text}
                    <span className="ml-1.5 font-sans text-xs">(지난 판)</span>
                  </li>
                ))}
              </ul>
              <h3 className="mb-2 mt-8 text-xs text-ash">
                닿아 본 엔딩 {view.endings.reached.length}/{view.endings.total}
              </h3>
              <ul className="space-y-1 text-sm">
                {view.endings.reached.map((en) => (
                  <li key={en.id} className="text-fog">
                    {en.title}
                    {en.count > 1 && <span className="ml-1 text-xs text-ash">×{en.count}</span>}
                  </li>
                ))}
                {view.endings.reached.length === 0 && <li className="text-ash">아직 없다.</li>}
              </ul>
            </div>
          )}

          {tab === 'journal' && (
            <ul className="space-y-4">
              {journal.length === 0 && <li className="text-sm text-ash">아직 없다.</li>}
              {[...journal].reverse().map((j) => (
                <li key={j.key}>
                  <p className="text-xs text-ash">
                    {j.run}번째 판 · {j.label}
                  </p>
                  <p className="font-serif-kr text-sm leading-7 text-fog">{j.line}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="kbd-hint border-t border-edge px-4 py-2 text-xs text-ash/80">
          {[...tabs.map((t) => `${t.key} ${t.label}`), 'J 지난 기록'].join(' · ')}
        </p>
        <div className="pb-[env(safe-area-inset-bottom)]" />
      </aside>
    </div>
  )
}
