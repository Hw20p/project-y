// 개발용: 장면 수준의 분기 그래프. 시작에서 가까운 순서로 열(layer)을 나누고, 되돌아가는 길은 점선으로 아래를 돌아간다.
import { useMemo, useState } from 'react'
import type { ExploreReport } from '../../scenario/explore.ts'
import type { Node, Scenario } from '../../scenario/types.ts'

const W = 156
const H = 46
const GAP_X = 74
const GAP_Y = 22
const PAD = 24

const KIND_LABEL: Record<Node['kind'], string> = { story: '이야기', vote: '추리', split: '조합', personal: '개인', ending: '엔딩' }
const TIER_COLOR = { true: '#d4b06a', good: '#9cc596', neutral: '#aaa699', bad: '#d2655c' } as const

function nodeColor(n: Node): string {
  if (n.kind === 'ending') return TIER_COLOR[n.tier]
  return { story: '#8b8779', vote: '#a9bfdf', split: '#b49cdf', personal: '#5fa59b' }[n.kind]
}

interface Placed {
  node: Node
  layer: number
  x: number
  y: number
  visited: boolean
}

export function GraphView({ sc, report }: { sc: Scenario; report: ExploreReport }) {
  const [selected, setSelected] = useState<string | null>(null)

  const layout = useMemo(() => {
    const byId = new Map(sc.nodes.map((n) => [n.id, n]))
    const out = new Map<string, string[]>()
    for (const e of report.graph.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to])

    // 시작에서 닿는 순서(BFS)로 열을 정한다. 한 번도 못 간 장면은 맨 오른쪽 열에 흐리게 둔다.
    const layerOf = new Map<string, number>([[sc.start, 0]])
    const order: string[] = [sc.start]
    for (let i = 0; i < order.length; i++) {
      for (const to of out.get(order[i]) ?? []) {
        if (!layerOf.has(to)) {
          layerOf.set(to, layerOf.get(order[i])! + 1)
          order.push(to)
        }
      }
    }
    const lastLayer = Math.max(0, ...layerOf.values())
    const unvisited = sc.nodes.map((n) => n.id).filter((id) => !layerOf.has(id))
    for (const id of unvisited) {
      layerOf.set(id, lastLayer + 1)
      order.push(id)
    }

    const rows = new Map<number, number>()
    const placed = new Map<string, Placed>()
    for (const id of order) {
      const node = byId.get(id)
      if (!node) continue
      const layer = layerOf.get(id)!
      const row = rows.get(layer) ?? 0
      rows.set(layer, row + 1)
      placed.set(id, {
        node,
        layer,
        x: PAD + layer * (W + GAP_X),
        y: PAD + row * (H + GAP_Y),
        visited: !unvisited.includes(id),
      })
    }
    const layers = Math.max(...layerOf.values()) + 1
    const height = PAD * 2 + Math.max(...rows.values()) * (H + GAP_Y) + 70
    return { placed, width: PAD * 2 + layers * (W + GAP_X) - GAP_X, height }
  }, [sc, report])

  const sel = selected ? layout.placed.get(selected) : null
  const selOut = selected ? report.graph.edges.filter((e) => e.from === selected) : []
  const selIn = selected ? report.graph.edges.filter((e) => e.to === selected) : []

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="overflow-auto rounded border border-edge bg-ink">
        <svg width={layout.width} height={layout.height} role="img" aria-label="분기 그래프">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#6b7086" />
            </marker>
          </defs>

          {report.graph.edges.map((e) => {
            const a = layout.placed.get(e.from)
            const b = layout.placed.get(e.to)
            if (!a || !b) return null
            const forward = b.layer > a.layer
            const hot = selected !== null && (e.from === selected || e.to === selected)
            const stroke = hot ? '#a9bfdf' : '#454a5c'
            const title = e.labels.join('\n')
            if (forward) {
              const x1 = a.x + W
              const y1 = a.y + H / 2
              const x2 = b.x
              const y2 = b.y + H / 2
              const dx = Math.max(30, (x2 - x1) / 2)
              return (
                <path
                  key={`${e.from}>${e.to}`}
                  d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={hot ? 2 : 1.2}
                  markerEnd="url(#arrow)"
                >
                  <title>{title}</title>
                </path>
              )
            }
            // 되돌아가는 길(같은 열 포함): 상자 아래를 돌아 점선으로
            const sx = a.x + W / 2
            const sy = a.y + H
            const tx = b.x + W / 2
            const ty = b.y + H
            const drop = 36 + Math.abs(a.layer - b.layer) * 8
            return (
              <path
                key={`${e.from}>${e.to}`}
                d={`M${sx},${sy} C${sx},${sy + drop} ${tx},${ty + drop} ${tx},${ty}`}
                fill="none"
                stroke={stroke}
                strokeWidth={hot ? 2 : 1.2}
                strokeDasharray="5 4"
                markerEnd="url(#arrow)"
              >
                <title>{title}</title>
              </path>
            )
          })}

          {[...layout.placed.values()].map((p) => {
            const color = nodeColor(p.node)
            const on = selected === p.node.id
            return (
              <g
                key={p.node.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={p.visited ? 1 : 0.38}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(on ? null : p.node.id)}
              >
                <rect
                  width={W}
                  height={H}
                  rx={7}
                  fill="#14161e"
                  stroke={color}
                  strokeWidth={on ? 3 : 1.4}
                  strokeDasharray={p.visited ? undefined : '3 3'}
                />
                <text x={10} y={18} fontSize={11} fill={color}>
                  {KIND_LABEL[p.node.kind]} · {p.node.id}
                </text>
                <text x={10} y={35} fontSize={12} fill="#ebe5d6">
                  {(p.node.title ?? '').slice(0, 14)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <aside className="rounded border border-edge bg-panel/60 p-3 text-sm">
        {sel ? (
          <>
            <p className="text-xs text-ash">
              {KIND_LABEL[sel.node.kind]}
              {!sel.visited && ' · 한 번도 지나가지 못함'}
            </p>
            <h3 className="mt-1 font-serif-kr text-base">{sel.node.title ?? sel.node.id}</h3>
            <p className="text-xs text-ash">{sel.node.id}</p>
            <h4 className="mt-3 text-xs text-ash">들어오는 길 ({selIn.length})</h4>
            <ul className="mt-1 space-y-1 text-xs text-fog">
              {selIn.map((e) => (
                <li key={e.from}>
                  <button type="button" className="text-glow hover:underline" onClick={() => setSelected(e.from)}>
                    {e.from}
                  </button>
                </li>
              ))}
              {selIn.length === 0 && <li className="text-ash">없음</li>}
            </ul>
            <h4 className="mt-3 text-xs text-ash">나가는 길 ({selOut.length})</h4>
            <ul className="mt-1 space-y-2 text-xs text-fog">
              {selOut.map((e) => (
                <li key={e.to}>
                  <button type="button" className="text-glow hover:underline" onClick={() => setSelected(e.to)}>
                    → {e.to}
                  </button>
                  <ul className="mt-0.5 space-y-0.5 pl-3 text-ash">
                    {e.labels.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </li>
              ))}
              {selOut.length === 0 && <li className="text-ash">없음</li>}
            </ul>
          </>
        ) : (
          <p className="text-xs leading-6 text-ash">
            장면을 누르면 들어오고 나가는 길이 보인다.
            <br />
            점선은 앞 장면으로 되돌아가는 길, 흐린 상자는 한 번도 지나가지 못한 장면이다.
          </p>
        )}
      </aside>
    </div>
  )
}
