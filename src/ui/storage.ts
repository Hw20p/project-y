// 브라우저에 남기는 것들. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 게임은 되고, 새로 고침 뒤에 이어지지만 않을 뿐이다.
/** 지난 기록의 한 줄 (판마다 브라우저에 저장한다). `run`은 몇 번째 판인지다. */
export interface JournalEntry {
  key: string
  run: number
  label: string
  line: string
  tone: 'ok' | 'bad' | 'plain'
}

const JOURNAL_PREFIX = 'project-y:journal:'
const JOURNAL_KEEP_MS = 3 * 24 * 60 * 60 * 1000
const SCREEN_KEY = 'project-y:screen'

interface SavedJournal {
  savedAt: number
  entries: JournalEntry[]
}

/** 지난 기록. 판(게임)마다 따로 저장하고, 오래된 것은 지운다. */
export function loadJournal(key: string): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_PREFIX + key)
    if (!raw) return []
    const saved = JSON.parse(raw) as SavedJournal
    return Array.isArray(saved.entries) ? saved.entries : []
  } catch {
    return []
  }
}

export function saveJournal(key: string, entries: JournalEntry[]): void {
  try {
    const saved: SavedJournal = { savedAt: Date.now(), entries }
    localStorage.setItem(JOURNAL_PREFIX + key, JSON.stringify(saved))
  } catch {
    // 저장이 안 되면 새로 고침 뒤에 기록이 비는 것뿐이다.
  }
}

/** 3일 넘게 손대지 않은 지난 기록을 지운다 */
export function pruneJournals(): void {
  try {
    const now = Date.now()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(JOURNAL_PREFIX)) continue
      let old = true
      try {
        old = now - (JSON.parse(localStorage.getItem(k) ?? '{}') as SavedJournal).savedAt > JOURNAL_KEEP_MS
      } catch {
        // 깨진 값도 지운다
      }
      if (old) localStorage.removeItem(k)
    }
  } catch {
    // 무시
  }
}

// ───────────────────────── 지금 화면 (탭마다) ─────────────────────────

/** 이 탭이 어떤 화면에 있었는지. 새로 고침하면 같은 화면(게임 중이던 판)으로 돌아오게 한다. */
export type SavedScreen = { kind: 'remote' }

export function loadScreen(): SavedScreen | null {
  try {
    const raw = sessionStorage.getItem(SCREEN_KEY)
    return raw ? (JSON.parse(raw) as SavedScreen) : null
  } catch {
    return null
  }
}

export function saveScreen(screen: SavedScreen | null): void {
  try {
    if (screen) sessionStorage.setItem(SCREEN_KEY, JSON.stringify(screen))
    else sessionStorage.removeItem(SCREEN_KEY)
  } catch {
    // 무시
  }
}
