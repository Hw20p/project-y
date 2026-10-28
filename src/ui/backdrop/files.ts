// 배경 그림 파일 찾기. 빌드할 때 `src/assets/backdrops/<시나리오 id>/` 안의 그림을 모두 찾아 둔다 (없으면 빈 목록).
// 파일 이름이 곧 장소다: `<장소>.webp`는 낮(기본) 그림, `<장소>-night.webp`는 있으면 밤 그림이다.
// Vite가 없는 환경(Node 스크립트)에서는 빈 목록이다.

export interface BackdropFiles {
  /** 낮(기본) 그림 */
  day: string | null
  /** 밤 그림 (없으면 낮 그림에 밤 보정을 입힌다) */
  night: string | null
}

const found = new Map<string, BackdropFiles>()

function scan(): void {
  let urls: Record<string, string> = {}
  try {
    urls = import.meta.glob('../../assets/backdrops/**/*.{webp,png,jpg,jpeg,avif}', { eager: true, query: '?url', import: 'default' })
  } catch {
    return
  }
  for (const [path, url] of Object.entries(urls)) {
    const m = /\/backdrops\/([^/]+)\/(.+?)(-night)?\.[a-z0-9]+$/i.exec(path)
    if (!m) continue
    const key = `${m[1]}/${m[2]}`
    const entry = found.get(key) ?? { day: null, night: null }
    if (m[3]) entry.night = url
    else entry.day = url
    found.set(key, entry)
  }
}
scan()

/** 이 시나리오의 이 장소에 연결된 그림 (없으면 둘 다 null → 배경을 그리지 않는다) */
export function findBackdrop(scenarioId: string, place: string): BackdropFiles {
  return found.get(`${scenarioId}/${place}`) ?? { day: null, night: null }
}

/** 장소마다 그림이 연결됐는지 (점검용: 개발 중 브라우저 콘솔에서 `__backdrops()`) */
export function backdropStatus(): { key: string; day: boolean; night: boolean }[] {
  return [...found].map(([key, f]) => ({ key, day: !!f.day, night: !!f.night }))
}
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __backdrops: () => console.table(backdropStatus()) })
}
