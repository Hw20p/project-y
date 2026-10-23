export interface JournalEntry {
  key: string
  month: number
  label: string
  line: string
  tone: 'ok' | 'bad' | 'plain'
}

/** 지금까지 일어난 일. 단서를 되짚으며 이야기하려면 다시 읽을 곳이 필요하다. */
export function JournalBody({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-ash">아직 기록이 없다.</p>
  return (
    <ul className="space-y-4">
      {[...entries].reverse().map((e) => (
        <li key={e.key}>
          <p className="text-xs text-ash">
            {e.month}번째 달 · {e.label}
          </p>
          <p
            className={`font-serif-kr text-sm leading-7 ${
              e.tone === 'ok' ? 'text-fog' : e.tone === 'bad' ? 'text-loss/80' : 'text-ash'
            }`}
          >
            {e.line}
          </p>
        </li>
      ))}
    </ul>
  )
}
