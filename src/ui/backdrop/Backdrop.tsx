// 장면 뒤에 깔리는 배경 그림. 이야기 속 장소(`place`) × 시간대(낮/밤) × 이야기가 정한 어둠(정전 등)으로 정해진다.
// 밤·정전은 낮 그림을 어둡고 푸르게 보정해서 보인다 (밤 그림 파일이 따로 있으면 그것을 쓴다).
// 글자를 읽을 수 있게 그림 위에 어두운 막을 덮는다. 그 장소의 그림 파일이 없으면 아무것도 그리지 않아 기존 배경만 보인다.
import { findBackdrop } from './files.ts'

/** day = 불이 켜진 낮, night = 밤, dark = 낮이든 밤이든 이야기가 정한 어둠(정전)이 켜진 모습 */
export type BackdropLook = 'day' | 'night' | 'dark'

export function Backdrop({ scenarioId, place, look }: { scenarioId: string; place: string; look: BackdropLook }) {
  const files = findBackdrop(scenarioId, place)
  // 밤 그림이 따로 있으면 밤·정전에서 그것을 쓰고, 없으면 낮 그림을 보정한다
  const url = look === 'day' ? (files.day ?? files.night) : (files.night ?? files.day)
  if (!url) return null
  const nightFile = look !== 'day' && !!files.night

  return (
    <div className="backdrop" aria-hidden>
      {/* 장소가 바뀌면 새로 나타난다 */}
      <div key={`${scenarioId}/${place}`} className="backdrop-place">
        <img src={url} alt="" className={`backdrop-art look-${look}${nightFile ? ' look-file' : ''}`} draggable={false} />
      </div>
      <div className="backdrop-scrim" />
    </div>
  )
}
