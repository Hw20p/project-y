// 대기실의 대상 고르기: 지도 위에 점으로 이름만 찍혀 있고, 누르면 소개가 보인다. 방장이 "이 곳으로 정한다"로 확정한다.
import { useEffect, useState } from 'react'
import type { LobbyModeInfo } from '../../net/protocol.ts'

const TYPE_LABEL: Record<string, string> = { creature: '생명체', place: '장소', object: '물건' }

/** 아직 조사되지 않은 곳: 지도를 채우는 흐린 표시 (누를 수 없다) */
const UNEXPLORED = [
  { x: 8, y: 16 },
  { x: 66, y: 8 },
  { x: 86, y: 58 },
  { x: 24, y: 78 },
  { x: 62, y: 44 },
  { x: 34, y: 14 },
  { x: 54, y: 12 },
  { x: 94, y: 46 },
  { x: 8, y: 50 },
  { x: 74, y: 84 },
  { x: 50, y: 88 },
  { x: 36, y: 54 },
]

/** 지도에 자리만 잡아 둔 임시 대상: 소개는 볼 수 있지만 정할 수는 없다. 서버에는 없고 화면에서만 그린다. */
const DUMMIES: LobbyModeInfo[] = [
  {
    id: 'dummy-1',
    code: 'A-03',
    name: '임시 대상 1',
    blurb: '아직 만들어지지 않은 자리표시이다. 나중에 실제 대상으로 바뀐다.',
    party: { min: 1, max: 8 },
    map: { x: 82, y: 30 },
    type: 'place',
  },
  {
    id: 'dummy-2',
    code: 'A-04',
    name: '임시 대상 2',
    blurb: '아직 만들어지지 않은 자리표시이다. 나중에 실제 대상으로 바뀐다.',
    party: { min: 2, max: 8 },
    map: { x: 14, y: 34 },
    type: 'object',
  },
]
const isDummy = (id: string) => DUMMIES.some((d) => d.id === id)

function MapBackdrop() {
  // 모눈, 등고선 같은 곡선, 가장자리 눈금. 비율을 늘려 그려도 괜찮은 선만 쓴다.
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 60"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <radialGradient id="map-glow" cx="50%" cy="48%" r="70%">
          <stop offset="0%" stopColor="#1a2036" />
          <stop offset="60%" stopColor="#0d0f17" />
          <stop offset="100%" stopColor="#07070a" />
        </radialGradient>
        <pattern id="map-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="#1b1f2d" strokeWidth="0.15" />
        </pattern>
      </defs>
      <rect width="100" height="60" fill="url(#map-glow)" />
      <rect width="100" height="60" fill="url(#map-grid)" />
      {/* 등고선 */}
      <g fill="none" stroke="#252a3b" strokeWidth="0.25">
        <path d="M-2 40 C14 30 24 46 40 38 S66 22 82 32 S98 44 102 38" />
        <path d="M-2 46 C12 38 26 52 42 44 S68 30 84 38 S98 50 102 44" opacity="0.8" />
        <path d="M-2 52 C10 46 28 58 44 50 S70 38 86 44 S98 56 102 50" opacity="0.6" />
        <path d="M-2 22 C16 14 30 28 48 20 S74 8 92 16 S100 22 102 20" opacity="0.7" />
        <path d="M-2 14 C18 8 32 20 50 12 S76 2 94 8" opacity="0.45" />
        <ellipse cx="44" cy="40" rx="20" ry="9" strokeDasharray="0.8 1.2" opacity="0.5" />
      </g>
      {/* 시설 윤곽 */}
      <path
        d="M8 10 H34 V18 H46 V10 H70 V20 H92 V48 H74 V54 H30 V44 H8 Z"
        fill="none"
        stroke="#2c303d"
        strokeWidth="0.3"
        strokeDasharray="1.6 1"
        opacity="0.55"
      />
    </svg>
  )
}

export function LobbyMap({
  modes,
  selected,
  canSelect,
  online,
  onSelect,
}: {
  modes: LobbyModeInfo[]
  /** 방에서 정해진 대상 */
  selected: string
  /** 방장이면 true */
  canSelect: boolean
  /** 지금 접속해 있는 인원 */
  online: number
  onSelect: (id: string) => void
}) {
  // 지금 소개를 보고 있는 점 (처음에는 정해진 대상)
  const [viewing, setViewing] = useState<string>(selected)
  // 방장이 다른 곳을 정하면 다른 사람의 소개 카드도 그곳으로 따라간다
  useEffect(() => setViewing(selected), [selected])
  const all = [...modes, ...DUMMIES]
  const shown = all.find((m) => m.id === viewing) ?? modes.find((m) => m.id === selected) ?? modes[0]
  const isSelected = shown?.id === selected
  const pending = !!shown && isDummy(shown.id)

  return (
    <div>
      <div className="relative aspect-[5/3] w-full overflow-hidden rounded border border-edge bg-void">
        <MapBackdrop />
        <p className="absolute left-3 top-2 text-[10px] tracking-[0.3em] text-ash/70">조사 지도</p>
        <p className="absolute right-3 top-2 text-[10px] tracking-widest text-ash/50">N ↑</p>
        <p className="absolute bottom-2 left-3 text-[10px] text-ash/50">점을 누르면 소개가 보인다</p>

        {UNEXPLORED.map((u, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-edge text-[10px] text-ash/50"
            style={{ left: `${u.x}%`, top: `${u.y}%` }}
          >
            ?
          </span>
        ))}

        {all.map((m) => {
          const on = m.id === selected
          const focus = m.id === shown?.id
          const left = m.map.x > 60
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setViewing(m.id)}
              aria-pressed={focus}
              aria-label={`${m.code} ${m.name}`}
              className="group absolute -translate-x-1/2 -translate-y-1/2 p-3"
              style={{ left: `${m.map.x}%`, top: `${m.map.y}%` }}
            >
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                {(on || focus) && <span className={`ping-ring absolute inset-0 rounded-full ${on ? 'bg-amber/50' : 'bg-glow/40'}`} />}
                <span
                  className={`relative block rounded-full transition-all ${
                    on ? 'h-3.5 w-3.5 bg-amber' : focus ? 'h-3 w-3 bg-glow' : 'h-2.5 w-2.5 bg-fog group-hover:bg-bone'
                  }`}
                />
                {focus && <span className="absolute -inset-1.5 rounded-full border border-bone/40" />}
              </span>
              <span
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs ${
                  left ? 'right-full mr-1.5 text-right' : 'left-full ml-1.5'
                }`}
              >
                <span className="block text-[10px] leading-3 text-ash">{m.code}</span>
                <span className={`block font-serif-kr text-sm leading-4 ${on ? 'text-amber' : focus ? 'text-bone' : 'text-fog'}`}>{m.name}</span>
              </span>
            </button>
          )
        })}
      </div>

      {shown && (
        <article key={shown.id} className="rise mt-3 rounded border border-edge bg-panel/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-widest text-ash">
                {shown.code} · {TYPE_LABEL[shown.type] ?? shown.type}
              </p>
              <h3 className="mt-1 font-serif-kr text-xl font-bold">{shown.name}</h3>
            </div>
            {pending && <span className="shrink-0 rounded border border-edge px-2 py-0.5 text-xs text-ash">준비 중</span>}
            {isSelected && <span className="shrink-0 rounded border border-amber/50 px-2 py-0.5 text-xs text-amber">이번 조사 대상</span>}
          </div>
          <p className="mt-3 font-serif-kr text-sm leading-7 text-fog">{shown.blurb}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ash">
            <div>
              <dt className="inline">함께할 인원 </dt>
              <dd className="inline text-fog">
                {shown.party.min === shown.party.max ? `${shown.party.min}명` : `${shown.party.min}~${shown.party.max}명`}
              </dd>
            </div>
            <div>
              <dt className="inline">지금 </dt>
              <dd className={`inline ${online >= shown.party.min && online <= shown.party.max ? 'text-gain' : 'text-amber'}`}>
                {online}명
              </dd>
            </div>
          </dl>

          {canSelect ? (
            <button
              type="button"
              disabled={isSelected || pending}
              onClick={() => onSelect(shown.id)}
              className="mt-4 w-full rounded border border-amber/50 bg-amber/10 px-4 py-2.5 text-sm text-amber transition hover:bg-amber/20 disabled:cursor-default disabled:border-edge disabled:bg-transparent disabled:text-ash"
            >
              {isSelected ? '이 곳으로 정했다' : pending ? '아직 정할 수 없다' : '이 곳으로 정한다'}
            </button>
          ) : (
            !isSelected && (
              <p className="mt-4 text-xs text-ash">
                방장이 정한 곳은 「{modes.find((m) => m.id === selected)?.name ?? '?'}」이다.
              </p>
            )
          )}
        </article>
      )}
    </div>
  )
}
