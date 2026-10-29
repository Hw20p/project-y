// 소리 엔진: "어떤 순간에 어떤 소리가 난다"는 구조만 갖춰 두고, 실제 소리는 파일을 폴더에 넣으면 붙는다.
//
//   src/assets/audio/sfx/<소리 id>.ogg|mp3|wav|m4a   효과음 (짧은 소리)
//   src/assets/audio/bgm/<배경음 id>.ogg|mp3|wav|m4a  배경음 (이어서 반복)
//
// 코드를 고칠 필요가 없다. 같은 소리 id로 `select-2.ogg`, `select-3.ogg`처럼 번호를 붙이면 여러 개 중 무작위로 하나가 난다.
// 파일이 없는 효과음은 임시로 합성음(synth)이 나고, 합성음도 없는 소리(type)는 조용히 넘어간다.
// 파일이 없는 배경음도 WebAudio로 합성한 낮은 드론(`BEDS`)이 깔린다. 조명이 어두워질수록 음정이 어긋나고 조명 험이 커지며,
// 정신력이 낮으면 모든 소리가 먹먹해지고 심장 박동이 깔린다 (`setMood`). 곡 파일을 넣으면 그 곡이 드론을 대신한다.
// 소리 id 목록과 쓰이는 순간은 아래 `SFX`·`BGM`과 src/assets/audio/README.md에 있다.
//
// 이 모듈은 화면(React)을 모른다. 설정(켬/끔·음량)과 배경음 지정은 fx.tsx가 이어 준다.

export type SfxId =
  | 'type'
  | 'select'
  | 'cancel'
  | 'ready'
  | 'open'
  | 'close'
  | 'draw'
  | 'land'
  | 'good'
  | 'bad'
  | 'death'
  | 'fragment'
  | 'item'
  | 'dim'
  | 'blackout'
  | 'dusk'
  | 'dawn'
  | 'ending-true'
  | 'ending-good'
  | 'ending-neutral'
  | 'ending-bad'

export type BgmId = 'lobby' | 'day' | 'night' | 'dark' | 'ending'

type Tone = (freq: number, dur: number, type: OscillatorType, gain: number, delay?: number, slideTo?: number) => void

interface SfxSpec {
  /** 언제 나는 소리인지 (문서·점검용) */
  when: string
  /** 파일 소리의 음량 (0~1, 전체 음량과 곱해진다). 파일마다 크기가 다르면 여기서 맞춘다. */
  volume: number
  /** 같은 소리가 이 시간(ms) 안에 다시 나지 않게 한다 */
  minGap: number
  /** 파일이 없을 때 대신 나는 임시 합성음. 없으면 파일이 있을 때만 난다. */
  synth?: (tone: Tone) => void
}

export const SFX: Record<SfxId, SfxSpec> = {
  type: { when: '글자가 한 글자씩 찍힐 때 (아주 짧고 작게)', volume: 0.4, minGap: 55 },
  select: { when: '선택지를 눌러 고를 때', volume: 0.8, minGap: 0, synth: (t) => t(520, 0.07, 'triangle', 0.05) },
  cancel: { when: '고른 것을 다시 눌러 취소할 때', volume: 0.7, minGap: 0, synth: (t) => t(380, 0.08, 'triangle', 0.04, 0, 300) },
  ready: { when: '"계속" 버튼을 누를 때', volume: 0.7, minGap: 0, synth: (t) => t(400, 0.06, 'triangle', 0.04) },
  open: {
    when: '오른쪽 정보 패널을 열 때',
    volume: 0.7,
    minGap: 0,
    synth: (t) => {
      t(300, 0.08, 'sine', 0.04)
      t(450, 0.1, 'sine', 0.04, 0.05)
    },
  },
  close: {
    when: '정보 패널을 닫을 때',
    volume: 0.7,
    minGap: 0,
    synth: (t) => {
      t(450, 0.08, 'sine', 0.04)
      t(300, 0.1, 'sine', 0.04, 0.05)
    },
  },
  draw: { when: '동률 추첨에서 불빛이 한 칸 넘어갈 때', volume: 0.7, minGap: 0, synth: (t) => t(760, 0.035, 'square', 0.025) },
  land: {
    when: '동률 추첨이 한 선택지에 멈출 때',
    volume: 0.9,
    minGap: 0,
    synth: (t) => {
      t(520, 0.12, 'triangle', 0.06)
      t(780, 0.2, 'triangle', 0.06, 0.1)
    },
  },
  good: {
    when: '결과가 나쁘지 않을 때 (변화 칩이 나타나는 순간)',
    volume: 0.9,
    minGap: 0,
    synth: (t) => {
      t(440, 0.18, 'sine', 0.06)
      t(660, 0.28, 'sine', 0.06, 0.12)
    },
  },
  bad: { when: '부상·정신력 감소처럼 대가를 치를 때', volume: 1, minGap: 0, synth: (t) => t(260, 0.35, 'sawtooth', 0.05, 0, 130) },
  death: {
    when: '아주 큰 충격 (화면이 흔들리는 결과)',
    volume: 1,
    minGap: 0,
    synth: (t) => {
      t(110, 0.9, 'sawtooth', 0.08, 0, 45)
      t(70, 1.1, 'sine', 0.1, 0.05, 35)
    },
  },
  fragment: {
    when: '새 단서를 알아낼 때',
    volume: 0.9,
    minGap: 0,
    synth: (t) => {
      t(880, 0.4, 'sine', 0.05)
      t(1320, 0.5, 'sine', 0.04, 0.1)
    },
  },
  item: {
    when: '아이템을 얻을 때',
    volume: 0.9,
    minGap: 0,
    synth: (t) => {
      t(620, 0.12, 'triangle', 0.05)
      t(830, 0.2, 'triangle', 0.05, 0.1)
    },
  },
  dim: { when: '조명이 한 단계 어두워질 때', volume: 1, minGap: 0, synth: (t) => t(180, 0.5, 'sine', 0.05, 0, 120) },
  blackout: { when: '조명이 완전히 꺼질 때 (암전)', volume: 1, minGap: 0, synth: (t) => t(90, 1.2, 'sawtooth', 0.07, 0, 30) },
  dusk: { when: '낮에서 밤으로 넘어갈 때', volume: 0.9, minGap: 0, synth: (t) => t(330, 0.5, 'sine', 0.04, 0, 220) },
  dawn: { when: '밤이 지나 새 낮이 올 때 (하루가 지남)', volume: 0.9, minGap: 0, synth: (t) => t(330, 0.5, 'sine', 0.04, 0, 495) },
  'ending-true': {
    when: '진엔딩에 닿았을 때',
    volume: 1,
    minGap: 0,
    synth: (t) => {
      t(440, 0.5, 'sine', 0.06)
      t(660, 0.6, 'sine', 0.06, 0.2)
      t(880, 0.8, 'sine', 0.05, 0.4)
    },
  },
  'ending-good': {
    when: '좋은 엔딩에 닿았을 때',
    volume: 1,
    minGap: 0,
    synth: (t) => {
      t(440, 0.4, 'sine', 0.05)
      t(550, 0.5, 'sine', 0.05, 0.2)
    },
  },
  'ending-neutral': { when: '보통 엔딩에 닿았을 때', volume: 1, minGap: 0, synth: (t) => t(330, 0.7, 'sine', 0.05) },
  'ending-bad': { when: '나쁜 엔딩에 닿았을 때', volume: 1, minGap: 0, synth: (t) => t(150, 1.0, 'sawtooth', 0.07, 0, 60) },
}

export const BGM: Record<BgmId, { when: string; volume: number }> = {
  lobby: { when: '대기실 (방에서 대상을 고르는 동안)', volume: 0.5 },
  day: { when: '낮 장면 (조명이 아직 밝을 때)', volume: 0.5 },
  night: { when: '밤 장면', volume: 0.5 },
  dark: { when: '조명이 절반 넘게 어두워졌을 때', volume: 0.5 },
  ending: { when: '엔딩 화면', volume: 0.5 },
}

// ───────────────────────── 파일 찾기 ─────────────────────────
// 빌드할 때 폴더에 있는 소리 파일을 모두 찾아 둔다 (없으면 빈 목록). Vite가 없는 환경(Node 스크립트)에서는 빈 목록이다.

const found: Record<'sfx' | 'bgm', Map<string, string[]>> = { sfx: new Map(), bgm: new Map() }

function scan(): void {
  let urls: Record<string, string> = {}
  try {
    urls = import.meta.glob('../assets/audio/**/*.{ogg,mp3,wav,m4a}', { eager: true, query: '?url', import: 'default' })
  } catch {
    return
  }
  for (const [path, url] of Object.entries(urls).sort(([a], [b]) => (a < b ? -1 : 1))) {
    // 파일 이름 끝의 "-숫자"는 같은 소리의 다른 버전이다 (select.ogg, select-2.ogg …)
    const m = /\/audio\/(sfx|bgm)\/(.+?)(?:-(\d+))?\.[a-z0-9]+$/i.exec(path)
    if (!m) continue
    const map = found[m[1] as 'sfx' | 'bgm']
    map.set(m[2], [...(map.get(m[2]) ?? []), url])
  }
}
scan()

/** 소리마다 연결된 파일이 몇 개인지 (점검용: 개발 중 브라우저 콘솔에서 `__sounds()`) */
export function soundStatus(): { kind: 'sfx' | 'bgm'; id: string; when: string; files: number }[] {
  return [
    ...(Object.keys(SFX) as SfxId[]).map((id) => ({ kind: 'sfx' as const, id, when: SFX[id].when, files: found.sfx.get(id)?.length ?? 0 })),
    ...(Object.keys(BGM) as BgmId[]).map((id) => ({ kind: 'bgm' as const, id, when: BGM[id].when, files: found.bgm.get(id)?.length ?? 0 })),
  ]
}
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __sounds: () => console.table(soundStatus()) })
}

// ───────────────────────── 재생 ─────────────────────────

let enabled = false
let volume = 0.7
let ctx: AudioContext | null = null
let master: GainNode | null = null
let muffle: BiquadFilterNode | null = null

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = volume
    // 정신력이 낮으면 모든 소리가 이 필터를 지나며 먹먹해진다 (`setMood`)
    muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.Q.value = 0.7
    muffle.frequency.value = muffleHz()
    master.connect(muffle).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

const tone: Tone = (freq, dur, type, gain, delay = 0, slideTo) => {
  if (!ctx || !master) return
  const t0 = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(amp).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** 파일을 내려받아 해독한 결과 (한 번만). 못 읽는 파일은 null이라 합성음·무음으로 넘어간다. */
const buffers = new Map<string, Promise<AudioBuffer | null>>()
function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url)
  if (!p) {
    p = (async () => {
      try {
        const c = audio()
        if (!c) return null
        const res = await fetch(url)
        if (!res.ok) return null
        return await c.decodeAudioData(await res.arrayBuffer())
      } catch {
        return null
      }
    })()
    buffers.set(url, p)
  }
  return p
}

const lastAt = new Map<SfxId, number>()

export function playSfx(id: SfxId): void {
  if (!enabled) return
  const spec = SFX[id]
  const now = Date.now()
  if (now - (lastAt.get(id) ?? 0) < spec.minGap) return
  lastAt.set(id, now)
  try {
    const c = audio()
    if (!c) return
    const files = found.sfx.get(id)
    if (files?.length) {
      void load(files[Math.floor(Math.random() * files.length)]).then((buffer) => {
        if (!enabled) return
        if (!buffer || !master) return spec.synth?.(tone) // 못 읽는 파일이면 임시 합성음으로 대신한다
        const src = c.createBufferSource()
        const amp = c.createGain()
        src.buffer = buffer
        amp.gain.value = spec.volume
        src.connect(amp).connect(master)
        src.start()
      })
      return
    }
    spec.synth?.(tone)
  } catch {
    // 소리를 못 내는 환경에서는 조용히 넘어간다.
  }
}

// ───────────────────────── 배경음 ─────────────────────────
// 배경음은 "지금 어떤 곡이어야 하는가"(`setMusic`)만 알려 주면 서로 겹쳐 자연스럽게 바뀐다. 곡 파일이 없으면 조용하다.

const FADE = 1.4
let wanted: BgmId | null = null
/** 지금 깔리고 있는 곡: 파일이든 합성이든 같은 모양으로 다룬다 */
interface Playing {
  id: BgmId
  amp: GainNode
  /** 이 시각(AudioContext 시간)에 곡을 멈춘다 */
  end: (at: number) => void
  /** 조명·정신력(`setMood`)이 바뀌었을 때 합성 곡이 따라가는 방법 */
  update?: () => void
}
let playing: Playing | null = null
let musicToken = 0
let musicTimer: ReturnType<typeof setTimeout> | undefined

function fadeOut(track: Playing): void {
  const c = ctx
  if (!c) return
  const t = c.currentTime
  track.amp.gain.cancelScheduledValues(t)
  track.amp.gain.setValueAtTime(track.amp.gain.value, t)
  track.amp.gain.linearRampToValueAtTime(0, t + FADE)
  track.end(t + FADE + 0.1)
}

function syncMusic(): void {
  const target = enabled ? wanted : null
  if ((playing?.id ?? null) === target) return
  const token = ++musicToken
  if (playing) {
    fadeOut(playing)
    playing = null
  }
  if (!target) return
  const files = found.bgm.get(target)
  if (!files?.length) {
    // 곡 파일이 없으면 합성한 드론을 깐다
    const c = audio()
    if (c && master) playing = makeAmbient(c, master, target)
    return
  }
  void load(files[0]).then((buffer) => {
    const c = ctx
    if (!buffer || !c || !master || token !== musicToken) return
    const src = c.createBufferSource()
    const amp = c.createGain()
    src.buffer = buffer
    src.loop = true
    amp.gain.setValueAtTime(0, c.currentTime)
    amp.gain.linearRampToValueAtTime(BGM[target].volume, c.currentTime + FADE)
    src.connect(amp).connect(master)
    src.start()
    playing = { id: target, amp, end: (at) => src.stop(at) }
  })
}

// ───────────────────────── 합성 드론과 분위기 ─────────────────────────
// 곡 파일이 없을 때 깔리는 낮은 소리. 파일을 넣으면 그 곡이 쓰이므로 이 값들은 임시 분위기다.

interface Bed {
  /** 바닥 음(Hz)과 그 위에 겹치는 음(Hz). 두 음이 가까울수록 맥놀이가 크다 */
  root: number
  upper: number
  /** 소리가 먹먹한 정도(저역 통과 Hz)와 전체 크기 */
  cutoff: number
  gain: number
  /** 숨쉬듯 커졌다 작아지는 정도 (gain의 비율) */
  breath: number
}

const BEDS: Record<BgmId, Bed> = {
  lobby: { root: 98, upper: 147, cutoff: 1100, gain: 0.05, breath: 0.07 },
  day: { root: 110, upper: 165, cutoff: 900, gain: 0.045, breath: 0.09 },
  night: { root: 73.4, upper: 110, cutoff: 520, gain: 0.055, breath: 0.06 },
  dark: { root: 55, upper: 58.3, cutoff: 320, gain: 0.07, breath: 0.12 },
  ending: { root: 87.3, upper: 130.8, cutoff: 800, gain: 0.05, breath: 0.05 },
}

/** 조명이 어두운 정도(darkness, 0~1)와 내 정신력. 화면이 `setMood`로 알린다. */
let mood = { darkness: 0, sanity: 10 }

/** 정신력이 3 이하로 떨어진 정도 (0~1). 글이 번지는 연출(`distortAt`)과 같은 기준이다. */
const strain = (): number => Math.min(1, Math.max(0, (4 - mood.sanity) / 4))

/** 정신력이 낮을수록 높은 소리부터 깎인다 (정신력 0에서 1.6kHz) */
const muffleHz = (): number => 20000 * Math.pow(0.08, strain())

function makeAmbient(c: AudioContext, out: AudioNode, id: BgmId): Playing {
  const bed = BEDS[id]
  const t0 = c.currentTime
  const amp = c.createGain()
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(bed.gain, t0 + FADE)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = bed.cutoff
  lp.connect(amp).connect(out)

  const osc = (type: OscillatorType, freq: number, gain: number): OscillatorNode => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.value = gain
    o.connect(g).connect(lp)
    o.start(t0)
    return o
  }
  const root = osc('sine', bed.root, 1)
  const sub = osc('sine', bed.root / 2, 0.6)
  const upper = osc('triangle', bed.upper, 0.55)
  // 조명 험: 어두울수록 커지고, 불이 나가려는 듯 가끔 끊긴다
  const humGain = c.createGain()
  humGain.gain.value = 0
  humGain.connect(amp)
  const hum = c.createOscillator()
  hum.type = 'sine'
  hum.frequency.value = 100
  hum.connect(humGain)
  hum.start(t0)
  // 숨쉬는 듯한 느린 흔들림
  const lfo = c.createOscillator()
  const lfoGain = c.createGain()
  lfo.frequency.value = 0.11
  lfoGain.gain.value = bed.gain * bed.breath
  lfo.connect(lfoGain).connect(amp.gain)
  lfo.start(t0)

  const humLevel = () => Math.pow(mood.darkness, 1.5) * 0.5 * bed.gain
  const update = () => {
    const t = c.currentTime
    upper.detune.setTargetAtTime(mood.darkness * 45, t, 0.6)
    humGain.gain.setTargetAtTime(humLevel(), t, 0.6)
    lp.frequency.setTargetAtTime(bed.cutoff * (1 - mood.darkness * 0.3), t, 0.8)
  }
  update()

  let flickerTimer: ReturnType<typeof setTimeout> | undefined
  let alive = true
  const flicker = () => {
    if (!alive) return
    if (mood.darkness > 0.3) {
      const t = c.currentTime
      humGain.gain.cancelScheduledValues(t)
      humGain.gain.setValueAtTime(0, t)
      humGain.gain.setTargetAtTime(humLevel(), t + 0.05 + Math.random() * 0.1, 0.05)
    }
    flickerTimer = setTimeout(flicker, 600 + Math.random() * 1800)
  }
  flicker()

  return {
    id,
    amp,
    update,
    end: (at) => {
      alive = false
      clearTimeout(flickerTimer)
      for (const o of [root, sub, upper, hum, lfo]) o.stop(at)
    },
  }
}

let beating = false
let beatTimer: ReturnType<typeof setTimeout> | undefined

/** 정신력이 낮으면 낮은 심장 박동이 깔린다 (낮을수록 빠르고 크다) */
function syncHeartbeat(): void {
  const want = enabled && !!ctx && strain() > 0
  if (want && !beating) {
    beating = true
    beat()
  } else if (!want && beating) {
    beating = false
    clearTimeout(beatTimer)
  }
}

function beat(): void {
  if (!beating) return
  const s = strain()
  tone(58, 0.16, 'sine', 0.05 + s * 0.1)
  tone(52, 0.2, 'sine', 0.04 + s * 0.08, 0.17)
  beatTimer = setTimeout(beat, 1250 - s * 650)
}

/**
 * 지금 화면의 분위기를 알린다: 조명이 어두운 정도(0~1)와 내 정신력. 합성 드론의 음정과 험, 모든 소리의 먹먹함, 심장 박동이 따라간다.
 * 게임 화면이 사라질 때는 `setMood({ darkness: 0, sanity: 10 })`로 되돌린다.
 */
export function setMood(next: Partial<typeof mood>): void {
  mood = { ...mood, ...next }
  if (ctx && muffle) muffle.frequency.setTargetAtTime(muffleHz(), ctx.currentTime, 0.4)
  playing?.update?.()
  syncHeartbeat()
}

/** 지금 깔려야 할 배경음 (`null`이면 조용하게). 같은 틱 안의 여러 호출은 마지막 것만 따른다. */
export function setMusic(id: BgmId | null): void {
  wanted = id
  clearTimeout(musicTimer)
  musicTimer = setTimeout(syncMusic, 0)
}

// ───────────────────────── 설정 ─────────────────────────

/** 소리 켬/끔과 전체 음량 (0~1)을 적용한다 */
export function configureAudio(opts: { enabled: boolean; volume: number }): void {
  const turnedOn = opts.enabled && !enabled
  enabled = opts.enabled
  volume = Math.min(1, Math.max(0, opts.volume))
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05)
  if (turnedOn) {
    audio()
    // 곧 날 가능성이 큰 효과음 파일을 미리 읽어 둔다 (처음 재생이 늦지 않게)
    for (const files of found.sfx.values()) for (const url of files) void load(url)
  }
  syncMusic()
  syncHeartbeat()
}

// 브라우저는 사용자가 한 번 누르기 전에는 소리를 막는다. 첫 입력에서 풀고, 기다리던 배경음을 시작한다.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!enabled) return
    audio()
    syncMusic()
    syncHeartbeat()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}
