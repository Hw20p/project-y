import type { GameView } from '../engine/view.ts'

/** 내 아이템과 단서. 단서는 나만 아는 것이라 말로 전해야 한다. */
export function InventoryBody({ me }: { me: GameView['me'] }) {
  const empty = me.items.length === 0 && me.hints.length === 0
  return (
    <div className="space-y-5">
      {empty && <p className="text-sm text-ash">아직 가진 것이 없다.</p>}
      {me.items.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs text-ash">아이템</h3>
          <ul className="space-y-3">
            {me.items.map((item) => (
              <li key={item.id}>
                <span className="text-bone">{item.name}</span>
                {item.keep && <span className="ml-1.5 text-xs text-amber">지켜짐</span>}
                {item.protects && <span className="ml-1.5 text-xs text-gain">죽음을 한 번 막음</span>}
                <p className="font-serif-kr text-sm leading-7 text-fog">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {me.hints.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs text-ash">단서 (나만 안다)</h3>
          <ul className="space-y-2">
            {me.hints.map((h) => (
              <li key={h.id} className="font-serif-kr text-sm leading-7 text-glow">
                ◆ {h.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
