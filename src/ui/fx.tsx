// 연출 설정(속도·소리)과 소리 연결. 설정은 브라우저에 저장되고 화면 어디서나 `useFx()`로 읽는다. 소리 자체는 audio.ts에 있다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { configureAudio, setMood, setMusic, type BgmId } from './audio.ts'

export { playSfx, type BgmId, type SfxId } from './audio.ts'

/** 0 = 즉시(연출 없음), 1 = 보통, 2 = 빠름 */
export type Speed = 0 | 1 | 2

interface FxSettings {
  speed: Speed
  sound: boolean
  /** 전체 음량 (0~1) */
  volume: number
  /** 글이 번지고 일그러지는 연출 (읽기 힘들면 끈다) */
  warp: boolean
  /** 조명이 꺼지기 직전에 화면이 커서(손가락) 주변만 보이는 연출 (읽기 힘들면 끈다) */
  torch: boolean
}

const KEY = 'project-y:fx'
const DEFAULTS: FxSettings = { speed: 1, sound: true, volume: 0.7, warp: true, torch: true }

function load(): FxSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<FxSettings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// ───────────────────────── 설정 ─────────────────────────

interface FxApi extends FxSettings {
  setSpeed: (s: Speed) => void
  setSound: (on: boolean) => void
  setVolume: (v: number) => void
  setWarp: (on: boolean) => void
  setTorch: (on: boolean) => void
}

const FxContext = createContext<FxApi | null>(null)

export function FxProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FxSettings>(load)

  useEffect(() => {
    configureAudio({ enabled: settings.sound, volume: settings.volume })
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // 저장이 안 되면 이번 방문에서만 적용된다.
    }
  }, [settings])

  const setSpeed = useCallback((speed: Speed) => setSettings((s) => ({ ...s, speed })), [])
  const setSound = useCallback((sound: boolean) => setSettings((s) => ({ ...s, sound })), [])
  const setVolume = useCallback((volume: number) => setSettings((s) => ({ ...s, volume })), [])
  const setWarp = useCallback((warp: boolean) => setSettings((s) => ({ ...s, warp })), [])
  const setTorch = useCallback((torch: boolean) => setSettings((s) => ({ ...s, torch })), [])
  const api = useMemo(
    () => ({ ...settings, setSpeed, setSound, setVolume, setWarp, setTorch }),
    [settings, setSpeed, setSound, setVolume, setWarp, setTorch],
  )

  return <FxContext value={api}>{children}</FxContext>
}

/** 이 화면이 보이는 동안 깔릴 배경음 (`null`이면 조용하게). 화면이 사라지면 서서히 꺼진다. */
export function useMusic(id: BgmId | null, flavor?: string): void {
  useEffect(() => {
    setMusic(id, flavor)
    return () => setMusic(null)
  }, [id, flavor])
}

/**
 * 지금 화면의 분위기(조명이 어두운 정도 0~1, 내 정신력)를 소리에 알린다. 합성 배경음의 음정·험, 모든 소리의 먹먹함, 심장 박동이 따라가고,
 * 화면이 사라지면 원래대로 돌아간다.
 */
export function useMood(darkness: number, sanity: number): void {
  useEffect(() => {
    setMood({ darkness, sanity })
  }, [darkness, sanity])
  useEffect(() => () => setMood({ darkness: 0, sanity: 10 }), [])
}

export function useFx(): FxApi {
  const api = useContext(FxContext)
  if (!api) throw new Error('FxProvider 안에서만 쓸 수 있다')
  return api
}

const SPEED_LABEL: Record<Speed, string> = { 1: '보통', 2: '빠름', 0: '즉시' }

/** 설정 단추 하나: 누르면 연출 설정(`FxSettingsBar`)이 아래로 펼쳐진다. 바깥을 누르거나 Esc로 닫는다. */
export function FxSettingsMenu() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest('[data-fx-menu]')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])
  return (
    <div className="relative" data-fx-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="설정"
        className={`rounded border px-2.5 py-2 text-sm sm:px-2.5 sm:py-1 sm:text-xs ${
          open ? 'border-glow/40 bg-glow/10 text-glow' : 'border-edge bg-panel/60 text-fog hover:border-fog/50 hover:text-bone'
        }`}
      >
        <span aria-hidden>⚙</span>
        <span className="ml-1.5 hidden sm:inline">설정</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded border border-edge bg-panel p-3 shadow-lg shadow-black/50">
          <FxSettingsBar />
        </div>
      )}
    </div>
  )
}

export function FxSettingsBar() {
  const { speed, sound, volume, warp, torch, setSpeed, setSound, setVolume, setWarp, setTorch } = useFx()
  const order: Speed[] = [1, 2, 0]
  return (
    <div className="flex flex-col items-stretch gap-3 text-xs text-ash">
      <span className="flex items-center justify-between gap-2">
        <span>글자 속도</span>
        <span className="flex overflow-hidden rounded border border-edge">
          {order.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`px-3 py-1.5 sm:px-2 sm:py-0.5 ${speed === s ? 'bg-glow/15 text-glow' : 'hover:text-fog'}`}
            >
              {SPEED_LABEL[s]}
            </button>
          ))}
        </span>
      </span>
      <span className="flex items-center justify-between gap-2" title="정신력이 낮을 때 글이 번지고 일그러지는 연출">
        <span>일그러짐</span>
        <button
          type="button"
          onClick={() => setWarp(!warp)}
          className={`rounded border px-3 py-1.5 sm:px-2 sm:py-0.5 ${
            warp ? 'border-glow/40 text-glow' : 'border-edge hover:text-fog'
          }`}
        >
          {warp ? '켬' : '끔'}
        </button>
      </span>
      <span className="flex items-center justify-between gap-2" title="조명이 꺼지기 직전, 커서 주변만 보이는 연출">
        <span>손전등</span>
        <button
          type="button"
          onClick={() => setTorch(!torch)}
          className={`rounded border px-3 py-1.5 sm:px-2 sm:py-0.5 ${
            torch ? 'border-glow/40 text-glow' : 'border-edge hover:text-fog'
          }`}
        >
          {torch ? '켬' : '끔'}
        </button>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span>소리</span>
        <span className="flex items-center gap-2">
          {sound && (
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              aria-label="음량"
              className="h-1 w-20 accent-glow"
            />
          )}
          <button
            type="button"
            onClick={() => setSound(!sound)}
            className={`rounded border px-3 py-1.5 sm:px-2 sm:py-0.5 ${
              sound ? 'border-glow/40 text-glow' : 'border-edge hover:text-fog'
            }`}
          >
            {sound ? '켬' : '끔'}
          </button>
        </span>
      </span>
    </div>
  )
}
