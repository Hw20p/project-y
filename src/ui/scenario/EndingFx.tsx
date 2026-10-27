// 엔딩 등급별 화면 연출: 화면 전체에 깔리는 장식이다 (규칙과 무관하고 클릭을 가로채지 않는다).
//  - bad     : 가장자리에서 피가 차오르고, 위에서 핏방울이 흘러내린다
//  - neutral : 잿빛 안개가 천천히 흐른다
//  - good    : 아래에서 따뜻한 빛이 올라오고 먼지가 떠오른다
//  - true    : 위에서 빛줄기가 쏟아지고 금빛 알갱이가 떠오른다
// 움직임은 index.css의 `.end-*`에 있다. 등급마다 한 번 번쩍이며 시작한다.
import type { EndingTier } from '../../scenario/types.ts'
import type { CSSProperties } from 'react'
import type { Distort } from '../Narration.tsx'

/** 흘러내리는 핏방울: 왼쪽 위치(%)·굵기(px)·내려오는 길이(vh)·시작 지연(s)·걸리는 시간(s) */
const DRIPS = [
  { x: 4, w: 8, len: 20, delay: 1.4, dur: 9 },
  { x: 13, w: 12, len: 34, delay: 2.6, dur: 12 },
  { x: 27, w: 7, len: 14, delay: 0.8, dur: 8 },
  { x: 41, w: 10, len: 26, delay: 3.4, dur: 11 },
  { x: 58, w: 7, len: 18, delay: 1.9, dur: 9 },
  { x: 69, w: 13, len: 38, delay: 3.0, dur: 14 },
  { x: 81, w: 8, len: 22, delay: 1.1, dur: 10 },
  { x: 93, w: 11, len: 30, delay: 2.2, dur: 12 },
]

/** 떠오르는 알갱이: 왼쪽 위치(%)·크기(px)·올라가는 시간(s)·시작 지연(s) */
const MOTES = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 37 + 11) % 97,
  size: 2 + (i % 3),
  dur: 9 + ((i * 7) % 9),
  delay: ((i * 13) % 11) * 0.8,
}))

/** 엔딩 본문에 입히는 글자 어긋남: 나쁜 엔딩만 크게 번지고 갈라진다 */
export const ENDING_DISTORT: Record<EndingTier, Distort> = {
  bad: { level: 0.8, glitch: 0.06 },
  neutral: { level: 0, glitch: 0 },
  good: { level: 0, glitch: 0 },
  true: { level: 0, glitch: 0 },
}

export function EndingBackdrop({ tier }: { tier: EndingTier }) {
  return (
    <div aria-hidden className={`end-fx end-fx-${tier}`}>
      <div className={`end-flash end-flash-${tier}`} />
      {tier === 'bad' && (
        <>
          <div className="end-blood" />
          {DRIPS.map((d, i) => (
            <div
              key={i}
              className="end-drip"
              style={
                {
                  left: `${d.x}%`,
                  width: `${d.w}px`,
                  '--len': `${d.len}vh`,
                  animationDelay: `${d.delay}s`,
                  animationDuration: `${d.dur}s`,
                } as CSSProperties
              }
            />
          ))}
        </>
      )}
      {tier === 'neutral' && (
        <>
          <div className="end-fog end-fog-a" />
          <div className="end-fog end-fog-b" />
        </>
      )}
      {(tier === 'good' || tier === 'true') && (
        <>
          <div className="end-dawn" />
          {tier === 'true' && <div className="end-rays" />}
          {MOTES.slice(0, tier === 'true' ? MOTES.length : 10).map((m, i) => (
            <span
              key={i}
              className="end-mote"
              style={
                {
                  left: `${m.x}%`,
                  width: `${m.size}px`,
                  height: `${m.size}px`,
                  animationDuration: `${m.dur}s`,
                  animationDelay: `${m.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </>
      )}
    </div>
  )
}
