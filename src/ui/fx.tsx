// 연출 설정(속도·소리)과 효과음. 설정은 브라우저에 저장되고 화면 어디서나 `useFx()`로 읽는다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** 0 = 즉시(연출 없음), 1 = 보통, 2 = 빠름 */
export type Speed = 0 | 1 | 2
export type Sfx = 'tick' | 'vote' | 'good' | 'bad' | 'death' | 'fragment' | 'item' | 'ready'

interface FxSettings {
  speed: Speed
  sound: boolean
}

const KEY = 'project-y:fx'
const DEFAULTS: FxSettings = { speed: 1, sound: false }

function load(): FxSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<FxSettings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// ───────────────────────── 효과음 (WebAudio로 만든 짧은 소리) ─────────────────────────

let audio: AudioContext | null = null
let soundOn = false

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  if (!audio) return
  const t0 = audio.currentTime + delay
  const osc = audio.createOscillator()
  const amp = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(amp).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

export function playSfx(kind: Sfx): void {
  if (!soundOn) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    switch (kind) {
      case 'tick':
        tone(760, 0.035, 'square', 0.025)
        break
      case 'vote':
        tone(520, 0.07, 'triangle', 0.05)
        break
      case 'ready':
        tone(400, 0.06, 'triangle', 0.04)
        break
      case 'good':
        tone(440, 0.18, 'sine', 0.06)
        tone(660, 0.28, 'sine', 0.06, 0.12)
        break
      case 'bad':
        tone(260, 0.35, 'sawtooth', 0.05, 0, 130)
        break
      case 'death':
        tone(110, 0.9, 'sawtooth', 0.08, 0, 45)
        tone(70, 1.1, 'sine', 0.1, 0.05, 35)
        break
      case 'fragment':
        tone(880, 0.4, 'sine', 0.05)
        tone(1320, 0.5, 'sine', 0.04, 0.1)
        break
      case 'item':
        tone(620, 0.12, 'triangle', 0.05)
        tone(830, 0.2, 'triangle', 0.05, 0.1)
        break
    }
  } catch {
    // 소리를 못 내는 환경에서는 조용히 넘어간다.
  }
}

// ───────────────────────── 설정 ─────────────────────────

interface FxApi extends FxSettings {
  setSpeed: (s: Speed) => void
  setSound: (on: boolean) => void
}

const FxContext = createContext<FxApi | null>(null)

export function FxProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FxSettings>(load)

  useEffect(() => {
    soundOn = settings.sound
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // 저장이 안 되면 이번 방문에서만 적용된다.
    }
  }, [settings])

  const setSpeed = useCallback((speed: Speed) => setSettings((s) => ({ ...s, speed })), [])
  const setSound = useCallback((sound: boolean) => setSettings((s) => ({ ...s, sound })), [])
  const api = useMemo(() => ({ ...settings, setSpeed, setSound }), [settings, setSpeed, setSound])

  return <FxContext value={api}>{children}</FxContext>
}

export function useFx(): FxApi {
  const api = useContext(FxContext)
  if (!api) throw new Error('FxProvider 안에서만 쓸 수 있다')
  return api
}

const SPEED_LABEL: Record<Speed, string> = { 1: '보통', 2: '빠름', 0: '즉시' }

export function FxSettingsBar() {
  const { speed, sound, setSpeed, setSound } = useFx()
  const order: Speed[] = [1, 2, 0]
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-ash sm:justify-end">
      <span className="flex items-center gap-2">
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
      <button
        type="button"
        onClick={() => setSound(!sound)}
        className={`rounded border px-3 py-1.5 sm:px-2 sm:py-0.5 ${
          sound ? 'border-glow/40 text-glow' : 'border-edge hover:text-fog'
        }`}
      >
        소리 {sound ? '켬' : '끔'}
      </button>
    </div>
  )
}
