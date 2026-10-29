// 시나리오의 정적 검증: 글자 하나 틀려서 게임이 멈추거나 길이 끊기는 일을 로드 시점에 잡는다.
// (모든 길을 실제로 돌려 보는 전수 탐색은 다음 단계에서 `explore`로 추가한다.)
import { STAT_KEYS, STAT_MAX, type Archetype } from './stats.ts'
import type { Cond, Effect, PersonalNode, Route, Scenario, Target, Text } from './types.ts'
import { ENDING_FX_NAMES, FX_NAMES, fxNamesIn, stripFx } from './fx.ts'

export interface ValidationReport {
  errors: string[]
  warnings: string[]
}

/** 조건·글이 어떤 맥락에서 평가되는지: 그 맥락에서 의미가 있는 것만 쓸 수 있다 */
interface Scope {
  /** `by: 'me'` — 글을 읽는 사람이 있는 맥락 */
  me: boolean
  /** `by: 'actor'` — 행동한 사람이 있는 맥락 */
  actor: boolean
  /** `picked` — 분할 장면의 행동 조합이 있는 맥락 */
  picked: boolean
}

const SCENE_TEXT: Scope = { me: true, actor: false, picked: false }
const PARTY: Scope = { me: false, actor: false, picked: false }
const OUTCOME: Scope = { me: false, actor: false, picked: true }
const ACTION_WHEN: Scope = { me: true, actor: true, picked: false }
const PRIVATE: Scope = { me: true, actor: true, picked: true }
/** 개인 장면: 그 사람 혼자 읽고 고르는 맥락 */
const PERSONAL: Scope = { me: true, actor: true, picked: false }

export function validateScenario(sc: Scenario): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []
  const at = (where: string, msg: string) => errors.push(`${sc.code} ${where}: ${msg}`)

  const itemIds = new Set(sc.items.map((i) => i.id))
  const factIds = new Set(sc.facts.map((f) => f.id))
  const varSpecs = new Map((sc.vars ?? []).map((v) => [v.id, v]))
  const nodeIds = new Set(sc.nodes.map((n) => n.id))
  const flagsSet = new Set<string>()
  const flagsRead = new Map<string, string>()
  const itemsGiven = new Set<string>()
  const factsLearned = new Set<string>()
  let sanityLoss = false
  let hasCalming = false

  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) at(label, `id 중복 "${id}"`)
      seen.add(id)
    }
  }
  unique('장면', sc.nodes.map((n) => n.id))
  unique('아이템', sc.items.map((i) => i.id))
  unique('사실', sc.facts.map((f) => f.id))
  unique('무작위 값', (sc.vars ?? []).map((v) => v.id))

  // ───── 조건·글·길·효과
  const cond = (c: Cond, scope: Scope, where: string, actions?: Set<string>): void => {
    if ('flag' in c) {
      if (!flagsRead.has(c.flag)) flagsRead.set(c.flag, where)
    } else if ('item' in c) {
      if (!itemIds.has(c.item)) at(where, `알 수 없는 아이템 "${c.item}"`)
      who(c.by, scope, where)
    } else if ('knows' in c) {
      if (!factIds.has(c.knows)) at(where, `알 수 없는 사실 "${c.knows}"`)
      who(c.by, scope, where)
    } else if ('hurt' in c) {
      if (c.hurt !== 'all') who(c.hurt, scope, where)
    } else if ('stat' in c) {
      if (c.min === undefined && c.max === undefined) at(where, '스텟 조건에 min이나 max가 필요함')
      if (c.min !== undefined && c.max !== undefined && c.min > c.max) at(where, '스텟 조건의 min이 max보다 큼')
      who(c.by, scope, where)
    } else if ('panic' in c) {
      if (c.panic !== 'all') who(c.panic, scope, where)
    } else if ('time' in c) {
      if (c.time.min === undefined && c.time.max === undefined) at(where, '시간 조건이 비어 있음')
    } else if ('party' in c) {
      if (c.party.min === undefined && c.party.max === undefined) at(where, '인원 조건이 비어 있음')
    } else if ('var' in c) {
      const spec = varSpecs.get(c.var)
      if (!spec) at(where, `알 수 없는 무작위 값 "${c.var}"`)
      else if (!spec.pick.includes(c.is)) at(where, `무작위 값 "${c.var}"에 "${c.is}"가 나올 수 없음`)
    } else if ('picked' in c) {
      if (!scope.picked) at(where, '`picked`는 분할 장면의 결과·비공개 발견에서만 쓸 수 있다')
      else if (actions && !actions.has(c.picked)) at(where, `알 수 없는 행동 "${c.picked}"`)
    } else if ('did' in c) {
      if (!scope.actor) at(where, '`did`는 행동하는 사람이 있는 곳(개인 장면의 선택지 조건)에서만 쓸 수 있다')
    } else if ('not' in c) {
      cond(c.not, scope, where, actions)
    } else if ('all' in c) {
      c.all.forEach((x) => cond(x, scope, where, actions))
    } else {
      c.any.forEach((x) => cond(x, scope, where, actions))
    }
  }

  const who = (by: string | undefined, scope: Scope, where: string) => {
    if (by === 'me' && !scope.me) at(where, '`by: "me"`는 장면·선택지 글처럼 읽는 사람이 있는 곳에서만 쓸 수 있다')
    if (by === 'actor' && !scope.actor) at(where, '`by: "actor"`는 비공개 발견·행동 조건에서만 쓸 수 있다')
  }

  const text = (t: Text, scope: Scope, where: string, actions?: Set<string>): void => {
    const parts = typeof t === 'string' ? [t] : t
    if (parts.length === 0) at(where, '글이 비어 있음')
    for (const part of parts) {
      const s = typeof part === 'string' ? part : part.text
      if (!stripFx(s).trim()) at(where, '빈 문장')
      for (const name of fxNamesIn(s)) if (!(FX_NAMES as readonly string[]).includes(name)) at(where, `알 수 없는 글자 효과 "${name}"`)
      if (typeof part !== 'string' && part.when) cond(part.when, scope, where, actions)
      for (const m of s.matchAll(/\{([^{}\s]+)\}/g)) {
        if (m[1] !== 'players' && !varSpecs.has(m[1])) at(where, `글 안의 {${m[1]}}에 맞는 무작위 값이 없음`)
      }
    }
  }

  const route = (r: Route, scope: Scope, where: string, actions?: Set<string>): string[] => {
    const to: string[] = []
    if (typeof r === 'string') to.push(r)
    else {
      if (r.length === 0) at(where, '길이 비어 있음')
      r.forEach((x, i) => {
        to.push(x.to)
        if (x.when) cond(x.when, scope, where, actions)
        else if (i !== r.length - 1) at(where, '조건 없는 길 뒤에 다른 길이 있어서 닿지 못함')
      })
      if (r.length > 0 && r[r.length - 1].when) at(where, '마지막 길은 조건 없이 두어야 한다 (맞는 길이 없으면 게임이 멈춘다)')
    }
    for (const id of to) if (!nodeIds.has(id)) at(where, `없는 장면 "${id}"`)
    return to
  }

  const target = (t: Target, allowActor: boolean, allowPicked: boolean, where: string, actions?: Set<string>) => {
    if (t === 'all') return
    if (t === 'actor') {
      if (!allowActor) at(where, '대상 "actor"는 비공개 발견에서만 쓸 수 있다')
      return
    }
    if (!allowPicked) at(where, '대상 { picked }는 분할 장면에서만 쓸 수 있다')
    else if (actions && !actions.has(t.picked)) at(where, `알 수 없는 행동 "${t.picked}"`)
  }

  const effects = (list: Effect[] | undefined, allowActor: boolean, allowPicked: boolean, where: string, actions?: Set<string>) => {
    for (const e of list ?? []) {
      if ('flag' in e) {
        if (!e.off) flagsSet.add(e.flag)
      } else if ('give' in e) {
        if (!itemIds.has(e.give)) at(where, `알 수 없는 아이템 "${e.give}"`)
        itemsGiven.add(e.give)
        target(e.to, allowActor, allowPicked, where, actions)
      } else if ('take' in e) {
        if (!itemIds.has(e.take)) at(where, `알 수 없는 아이템 "${e.take}"`)
        target(e.from, allowActor, allowPicked, where, actions)
      } else if ('learn' in e) {
        if (!factIds.has(e.learn)) at(where, `알 수 없는 사실 "${e.learn}"`)
        factsLearned.add(e.learn)
        target(e.to, allowActor, allowPicked, where, actions)
      } else if ('hurt' in e) {
        target(e.hurt, allowActor, allowPicked, where, actions)
      } else if ('heal' in e) {
        target(e.heal, allowActor, allowPicked, where, actions)
      } else if ('stat' in e) {
        if (e.add === 0) at(where, '스텟 효과의 add가 0임')
        if (e.stat === 'sanity' && e.add < 0) sanityLoss = true
        target(e.to, allowActor, allowPicked, where, actions)
      }
    }
  }

  /** 개인 장면: 각자 고르는 선택지와, 고른 뒤 혼자 이어지는 개인 단계들 */
  const validatePersonal = (n: PersonalNode): void => {
    const where = `장면 ${n.id}`
    text(n.text, SCENE_TEXT, `${where} 글`)
    // 선택지가 모두 `auto`인 장면(조사 뒤의 파고들기)은 고르는 장면이 아니라서, 선택지 수와 "조건 없는 선택지"를 따지지 않는다
    const allAuto = n.options.length > 0 && n.options.every((o) => o.auto)
    if (n.options.length < 2 && !allAuto) at(where, '선택지가 2개 이상 필요함')
    unique(where, n.options.map((o) => o.id))
    if (!allAuto && !n.options.some((o) => !o.when && !o.calming)) {
      at(where, '조건 없이 고를 수 있는 선택지가 없음 (아무도 고를 게 없으면 의미가 없다)')
    }
    if (n.options.some((o) => o.auto) && !allAuto) at(where, '`auto`는 선택지가 모두 auto일 때만 쓸 수 있다')
    for (const o of n.options) if (o.auto && !o.then) at(`${where}/${o.id}`, '`auto` 선택지에는 이어지는 단계(then)가 있어야 한다')
    const steps = n.steps ?? []
    const stepIds = new Set(steps.map((st) => st.id))
    unique(`${where} 단계`, steps.map((st) => st.id))
    const referenced = new Set<string>()
    const then = (id: string | undefined, w: string) => {
      if (id === undefined) return
      referenced.add(id)
      if (!stepIds.has(id)) at(w, `없는 개인 단계 "${id}"`)
    }

    for (const o of n.options) {
      const w = `${where}/${o.id}`
      text(o.text, PERSONAL, `${w} 문장`)
      if (o.when) cond(o.when, PERSONAL, `${w} 조건`)
      if (o.result) text(o.result, PERSONAL, `${w} 결과`)
      effects(o.effects, true, false, `${w} 효과`)
      effects(o.later, true, false, `${w} 나중 효과`)
      if (o.calming) hasCalming = true
      then(o.then, w)
    }
    const next = new Map<string, string[]>()
    for (const st of steps) {
      const w = `${where}/단계 ${st.id}`
      text(st.text, PERSONAL, `${w} 글`)
      effects(st.effects, true, false, `${w} 효과`)
      const outs: string[] = []
      then(st.then, w)
      if (st.then) outs.push(st.then)
      if (st.choices) {
        if (st.choices.length === 0) at(w, '선택지가 비어 있음')
        unique(w, st.choices.map((c) => c.id))
        if (st.then) at(w, '선택지가 있는 단계에는 then을 둘 수 없다 (선택지마다 then을 쓴다)')
        if (!st.choices.some((c) => !c.when && !c.calming)) {
          warnings.push(`${sc.code} ${w}: 조건 없이 고를 수 있는 선택지가 없어 상황에 따라 여기서 멈출 수 있음`)
        }
        for (const c of st.choices) {
          const cw = `${w}/${c.id}`
          text(c.text, PERSONAL, `${cw} 문장`)
          if (c.when) cond(c.when, PERSONAL, `${cw} 조건`)
          if (c.result) text(c.result, PERSONAL, `${cw} 결과`)
          effects(c.effects, true, false, `${cw} 효과`)
          effects(c.later, true, false, `${cw} 나중 효과`)
          if (c.calming) hasCalming = true
          then(c.then, cw)
          if (c.then) outs.push(c.then)
        }
      }
      next.set(st.id, outs)
    }
    // 단계는 한 방향으로만 이어진다 (돌고 도는 개인 단계는 끝나지 않을 수 있다)
    const state = new Map<string, 1 | 2>()
    const visit = (id: string): boolean => {
      if (state.get(id) === 1) return true
      if (state.get(id) === 2) return false
      state.set(id, 1)
      for (const to of next.get(id) ?? []) if (visit(to)) return true
      state.set(id, 2)
      return false
    }
    for (const st of steps) if (visit(st.id)) at(`${where}/단계 ${st.id}`, '개인 단계가 원을 그리며 이어짐')
    for (const st of steps) if (!referenced.has(st.id)) warnings.push(`${sc.code} ${where}: 개인 단계 "${st.id}"로 이어지는 곳이 없음`)
  }

  // ───── 장면
  const edges = new Map<string, string[]>()
  for (const n of sc.nodes) {
    const where = `장면 ${n.id}`
    const out: string[] = []
    edges.set(n.id, out)
    effects(n.onEnter, false, false, `${where} 들어올 때`)

    if (n.kind === 'ending') {
      text(n.text, SCENE_TEXT, `${where} 글`)
      if (n.fx && !(ENDING_FX_NAMES as readonly string[]).includes(n.fx)) at(where, `알 수 없는 엔딩 연출 "${n.fx}"`)
      continue
    }
    if (n.kind === 'story') {
      text(n.text, SCENE_TEXT, `${where} 글`)
      out.push(...route(n.next, PARTY, `${where} 길`))
    } else if (n.kind === 'vote') {
      text(n.text, SCENE_TEXT, `${where} 글`)
      if (n.choices.length < 2) at(where, '선택지가 2개 이상 필요함')
      if (!n.choices.some((c) => !c.when)) at(where, '조건 없이 고를 수 있는 선택지가 없음 (모두 잠기면 게임이 멈춘다)')
      unique(where, n.choices.map((c) => c.id))
      for (const c of n.choices) {
        const w = `${where}/${c.id}`
        text(c.text, SCENE_TEXT, `${w} 문장`)
        if (c.when) cond(c.when, PARTY, `${w} 조건`)
        if (c.result) text(c.result, PARTY, `${w} 결과`)
        effects(c.effects, false, false, `${w} 효과`)
        effects(c.later, false, false, `${w} 나중 효과`)
        out.push(...route(c.next, PARTY, `${w} 길`))
      }
    } else if (n.kind === 'personal') {
      validatePersonal(n)
      out.push(...route(n.next, PARTY, `${where} 길`))
    } else {
      text(n.text, SCENE_TEXT, `${where} 글`)
      const actions = new Set(n.actions.map((a) => a.id))
      if (n.actions.length < 2) at(where, '행동이 2개 이상 필요함')
      unique(where, n.actions.map((a) => a.id))
      if (!n.actions.some((a) => !a.when && !a.gate && !a.needsHealthy && a.max === undefined && a.min === undefined)) {
        at(where, '언제나 고를 수 있는 행동이 없음 (모두 잠기거나 정원이 차면 게임이 멈춘다)')
      }
      for (const a of n.actions) {
        const w = `${where}/${a.id}`
        text(a.text, SCENE_TEXT, `${w} 문장`)
        if (a.when) cond(a.when, ACTION_WHEN, `${w} 조건`)
        if (a.gate) cond(a.gate.cond, ACTION_WHEN, `${w} 자격`)
        if (a.max !== undefined && a.max < 1) at(w, 'max는 1 이상이어야 함')
        if (a.min !== undefined) {
          if (!Number.isInteger(a.min) || a.min < 2) at(w, 'min은 2 이상의 정수여야 함')
          else if (a.max !== undefined && a.min > a.max) at(w, 'min이 max보다 큼 (정원이 최소 인원보다 적으면 아무도 못 한다)')
          else if (a.min > (sc.party?.max ?? 8)) at(w, 'min이 시나리오의 최대 인원보다 큼')
        }
        if (a.calming) hasCalming = true
      }
      for (const f of n.private ?? []) {
        const w = `${where}/비공개 ${f.action}`
        if (!actions.has(f.action)) at(w, `알 수 없는 행동 "${f.action}"`)
        if (f.when) cond(f.when, PRIVATE, `${w} 조건`, actions)
        text(f.text, PRIVATE, `${w} 글`, actions)
        effects(f.effects, true, true, `${w} 효과`, actions)
        effects(f.later, true, true, `${w} 나중 효과`, actions)
      }
      if (n.outcomes.length === 0) at(where, '결과가 없음')
      if (n.holdResult) {
        const goesToPersonal = n.outcomes.some((o) => {
          const to = typeof o.next === 'string' ? [o.next] : o.next.map((x) => x.to)
          return to.some((id) => sc.nodes.find((m) => m.id === id)?.kind === 'personal')
        })
        if (!goesToPersonal) at(where, 'holdResult는 결과가 개인 장면으로 이어질 때만 의미가 있음')
      }
      n.outcomes.forEach((o, i) => {
        const w = `${where}/결과 ${i + 1}`
        if (o.when) cond(o.when, OUTCOME, `${w} 조건`, actions)
        else if (i !== n.outcomes.length - 1) at(w, '조건 없는 결과 뒤에 다른 결과가 있어서 닿지 못함')
        if (o.text) text(o.text, OUTCOME, `${w} 글`, actions)
        effects(o.effects, false, true, `${w} 효과`, actions)
        effects(o.later, false, true, `${w} 나중 효과`, actions)
        out.push(...route(o.next, OUTCOME, `${w} 길`, actions))
      })
      if (n.outcomes.length > 0 && n.outcomes[n.outcomes.length - 1].when) {
        at(where, '마지막 결과는 조건 없이 두어야 한다 (맞는 결과가 없으면 게임이 멈춘다)')
      }
    }
  }

  // ───── 시나리오 전체
  if (sc.clock.labels.length === 0) at('시계', '이름이 하나 이상 필요함')
  if (sc.clock.per !== undefined && (!Number.isInteger(sc.clock.per) || sc.clock.per < 1)) at('시계', 'per는 1 이상의 정수여야 함')
  if (sc.clock.lightName !== undefined && !sc.clock.light) at('시계', 'lightName은 light와 함께 써야 함')
  if (sc.clock.meter !== undefined && !sc.deadline) at('시계', 'meter는 마감(deadline)이 있어야 남은 칸을 보일 수 있음')
  if (sc.clock.meter !== undefined && sc.clock.light) at('시계', 'meter는 light와 함께 쓸 수 없음 (조명은 이미 막대로 보임)')
  if (sc.clock.byDay && !sc.nodes.some((n) => n.period)) at('시계', 'byDay는 장면에 period를 정해 둔 시나리오에서만 의미가 있음')
  if (!nodeIds.has(sc.start)) at('시작', `없는 장면 "${sc.start}"`)
  for (const v of sc.vars ?? []) if (v.pick.length < 2) at(`무작위 값 ${v.id}`, '후보가 2개 이상이어야 의미가 있음')

  const isEnding = (id: string) => sc.nodes.find((n) => n.id === id)?.kind === 'ending'
  const special: string[] = []
  if (sc.deadline) {
    if (!isEnding(sc.deadline.node)) at('마감', `"${sc.deadline.node}"는 엔딩 장면이어야 함`)
    if (sc.deadline.time < 1) at('마감', 'time은 1 이상이어야 함')
    special.push(sc.deadline.node)
  }
  if (sc.onAllPanic) {
    if (!isEnding(sc.onAllPanic)) at('전원 정신 상실', `"${sc.onAllPanic}"는 엔딩 장면이어야 함`)
    special.push(sc.onAllPanic)
  }
  if (sc.onAllHurt) {
    if (!isEnding(sc.onAllHurt)) at('전원 부상', `"${sc.onAllHurt}"는 엔딩 장면이어야 함`)
    special.push(sc.onAllHurt)
  }

  // 조사 보드: 관련 사실·풀림 조건·답 글
  unique('의문', (sc.board?.questions ?? []).map((q) => q.id))
  for (const q of sc.board?.questions ?? []) {
    const where = `의문 ${q.id}`
    if (q.facts.length === 0) at(where, '관련 사실이 없으면 보드에 단서가 붙지 않음')
    for (const f of q.facts) if (!factIds.has(f)) at(where, `알 수 없는 사실 "${f}"`)
    cond(q.solved, PARTY, where)
    if (q.open) cond(q.open, PARTY, where)
    text(q.answer, PARTY, where)
  }

  for (const d of sc.dossier ?? []) {
    if (d.unlock?.hint && !factIds.has(d.unlock.hint)) at(`자료 ${d.id}`, `알 수 없는 사실 "${d.unlock.hint}"`)
    if (d.lines.length === 0 || d.lines.some((l) => !l.trim())) at(`자료 ${d.id}`, '문장이 비어 있음')
  }

  // ───── 그래프: 시작에서 닿는 곳, 어디서든 엔딩으로 갈 수 있는지
  const reach = new Set<string>()
  const queue = [sc.start, ...special]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (reach.has(id) || !nodeIds.has(id)) continue
    reach.add(id)
    queue.push(...(edges.get(id) ?? []))
  }
  for (const n of sc.nodes) {
    if (!reach.has(n.id)) {
      if (n.kind === 'ending') at(`장면 ${n.id}`, '어디에서도 닿을 수 없는 엔딩')
      else warnings.push(`${sc.code} 장면 ${n.id}: 시작에서 닿을 수 없음`)
    }
  }
  // 엔딩에 닿을 수 있는 장면(거꾸로 따라가기)
  const canEnd = new Set(sc.nodes.filter((n) => n.kind === 'ending').map((n) => n.id))
  for (let changed = true; changed; ) {
    changed = false
    for (const [id, outs] of edges) {
      if (!canEnd.has(id) && outs.some((o) => canEnd.has(o))) {
        canEnd.add(id)
        changed = true
      }
    }
  }
  for (const n of sc.nodes) {
    if (reach.has(n.id) && !canEnd.has(n.id)) at(`장면 ${n.id}`, '여기서는 어떤 길로도 엔딩에 닿을 수 없음 (갇힌다)')
  }
  if (!sc.nodes.some((n) => n.kind === 'ending' && n.tier === 'true')) {
    warnings.push(`${sc.code}: 진엔딩(tier "true")이 없음`)
  }

  if (sanityLoss && !sc.onAllPanic) warnings.push(`${sc.code}: 정신력을 깎는 효과가 있는데 전원 정신 상실 엔딩(onAllPanic)이 없음`)
  if (sanityLoss && !hasCalming) warnings.push(`${sc.code}: 정신력을 깎는 효과가 있는데 진정시키는(calming) 선택지가 없어 정신을 잃으면 회복할 길이 없음`)

  for (const [flag, where] of flagsRead) {
    if (!flagsSet.has(flag)) at(where, `플래그 "${flag}"를 켜는 곳이 없어서 조건이 항상 거짓`)
  }
  for (const id of itemIds) if (!itemsGiven.has(id)) warnings.push(`${sc.code}: 아이템 "${id}"을(를) 주는 곳이 없음`)
  for (const id of factIds) if (!factsLearned.has(id)) warnings.push(`${sc.code}: 사실 "${id}"을(를) 알아내는 곳이 없음`)

  return { errors, warnings }
}

/** 입사 배경 검증: 정신력은 모두 같고, 나머지 스텟의 합도 모두 같아야 한다 ("무엇을 포기하느냐"의 선택이 되도록) */
export function validateArchetypes(list: Archetype[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const aptitude = (a: Archetype) => STAT_KEYS.filter((k) => k !== 'sanity').reduce((n, k) => n + a.stats[k], 0)
  for (const a of list) {
    if (ids.has(a.id)) errors.push(`입사 배경 id 중복 "${a.id}"`)
    ids.add(a.id)
    for (const k of STAT_KEYS) {
      if (a.stats[k] < 0 || a.stats[k] > STAT_MAX[k]) errors.push(`입사 배경 ${a.id}: ${k} ${a.stats[k]}가 0~${STAT_MAX[k]} 밖`)
    }
    if (a.stats.sanity !== list[0].stats.sanity) errors.push(`입사 배경 ${a.id}: 정신력이 다른 배경과 다름`)
    if (aptitude(a) !== aptitude(list[0])) errors.push(`입사 배경 ${a.id}: 체력·관찰의 합이 다른 배경과 다름`)
  }
  return errors
}
