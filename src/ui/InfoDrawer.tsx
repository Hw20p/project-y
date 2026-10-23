import type { GameView } from '../engine/view.ts'
import { InventoryBody } from './Inventory.tsx'
import { JournalBody, type JournalEntry } from './Journal.tsx'

export type DrawerTab = 'entity' | 'bag' | 'journal'

const TYPE_LABEL: Record<string, string> = { creature: '생명체', place: '장소', object: '물건' }

/** 언제든 열 수 있는 정보 패널: 지금 조사 중인 대상, 내 소지품·단서, 지난 기록 */
export function InfoDrawer({
  view,
  journal,
  tab,
  onTab,
  onClose,
}: {
  view: GameView
  journal: JournalEntry[]
  tab: DrawerTab
  onTab: (t: DrawerTab) => void
  onClose: () => void
}) {
  const e = view.entity
  const tabs: { id: DrawerTab; label: string; key: string; badge?: number }[] = [
    { id: 'entity', label: '대상 정보', key: 'I' },
    { id: 'bag', label: '소지품', key: 'B', badge: view.me.items.length + view.me.hints.length },
    { id: 'journal', label: '지난 기록', key: 'J', badge: journal.length },
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
                  tab === t.id ? 'bg-glow/15 text-glow' : 'text-fog hover:text-bone'
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
          {tab === 'entity' &&
            (e ? (
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
              </div>
            ) : (
              <p className="text-sm text-ash">지금 조사 중인 대상이 없다.</p>
            ))}
          {tab === 'bag' && <InventoryBody me={view.me} />}
          {tab === 'journal' && <JournalBody entries={journal} />}
        </div>

        <p className="kbd-hint border-t border-edge px-4 py-2 text-xs text-ash/80">
          {tabs.map((t) => `${t.key} ${t.label}`).join(' · ')}
        </p>
        <div className="pb-[env(safe-area-inset-bottom)]" />
      </aside>
    </div>
  )
}
