// 플레이어 한 명에게 보여 줄 화면용 상태. 서버는 `GameState` 전체가 아니라 이것만 각 클라이언트에 보낸다.
// 다른 사람의 밤 활동·단서·획득물처럼 비공개여야 하는 정보는 여기서 걸러진다.
import { MONTH_BEATS } from './config.ts'
import {
  currentBeat,
  currentDayEvent,
  currentEntity,
  findItem,
  nightChoicesFor,
  voteChoices,
} from './game.ts'
import type { Ending, GameState, MonthEndResult, NightEntry, TeamResult } from './state.ts'
import type { Beat, Choice, GameContext, HintDef, ItemDef } from './types.ts'

export interface ChoiceView {
  id: string
  text: string
  /** 내가 가진 단서가 이 선택지에 대해 말해 주는 것 */
  notes: string[]
}

export interface PlayerView {
  id: string
  name: string
  alive: boolean
  /** 이번 장면에서 선택을 마쳤는지 (무엇을 골랐는지는 결과가 나오기 전까지 숨긴다) */
  acted: boolean
  /** briefing·result에서 계속을 눌렀는지 */
  ready: boolean
}

export interface EntityView {
  code: string
  name: string
  type: string
  summary: string
  observation: string[]
  manual: string[]
}

export interface SceneView {
  beat: Beat
  title: string
  text: string
  /** 낮·결정은 모두에게 같은 목록, 밤은 내가 받은 목록 */
  choices: ChoiceView[]
  /** 내가 이미 골랐다면 그 선택지 */
  myChoiceId: string | null
}

/** 밤 결과: 내 것만 자세히, 남의 것은 죽음 여부만 */
export type NightEntryView =
  | ({ self: true } & NightEntry)
  | { self: false; playerId: string; diedId?: string; protectedId?: string }

export type ResultView =
  | (Omit<TeamResult, 'gainedHints'> & { gainedHints: HintDef[] })
  | { kind: 'night'; entries: NightEntryView[] }
  | MonthEndResult

export interface GameView {
  phase: GameState['phase']
  monthNumber: number
  beat: Beat | null
  /** 0부터. 몇 번째 장면인지 */
  beatIndex: number
  beatCount: number
  threat: number
  fragments: number
  me: { id: string; name: string; alive: boolean; items: ItemDef[]; hints: HintDef[] }
  players: PlayerView[]
  entity: EntityView | null
  scene: SceneView | null
  result: ResultView | null
  ending: Ending | null
}

function noteFor(choice: Choice, hintIds: string[]): string[] {
  return (choice.hints ?? []).filter((h) => hintIds.includes(h.hint)).map((h) => h.text)
}

export function viewFor(ctx: GameContext, state: GameState, playerId: string): GameView {
  const me = state.players.find((p) => p.id === playerId)
  if (!me) throw new Error(`알 수 없는 플레이어: ${playerId}`)

  const entity = currentEntity(ctx, state)
  const beat = currentBeat(state)

  const toChoiceViews = (choices: Choice[]): ChoiceView[] =>
    choices.map((c) => ({ id: c.id, text: c.text, notes: noteFor(c, me.hints) }))

  let scene: SceneView | null = null
  if (entity && state.phase === 'vote' && beat && beat !== 'night') {
    const day = currentDayEvent(ctx, state)
    scene = {
      beat,
      title: beat === 'decision' ? '결정' : day!.title,
      text: beat === 'decision' ? `${entity.name}을(를) 어떻게 할 것인가.` : day!.text,
      choices: toChoiceViews(voteChoices(ctx, state)),
      myChoiceId: state.votes[me.id] ?? null,
    }
  } else if (entity && state.phase === 'night') {
    scene = {
      beat: 'night',
      title: entity.night.title,
      text: entity.night.text,
      choices: toChoiceViews(nightChoicesFor(ctx, state, me.id)),
      myChoiceId: state.night?.picks[me.id] ?? null,
    }
  }

  const acted = (id: string): boolean =>
    state.phase === 'vote' ? !!state.votes[id] : state.phase === 'night' ? !!state.night?.picks[id] : false

  let result: ResultView | null = null
  const last = state.lastResult
  if (state.phase === 'result' || state.phase === 'ended') {
    if (last?.kind === 'team') {
      result = {
        ...last,
        gainedHints:
          last.actorId === me.id
            ? last.gainedHints.map((id) => ctx.hints.find((h) => h.id === id)!)
            : [],
        // 단서는 실행한 사람만 안다. 아이템 획득은 모두가 본다.
      }
    } else if (last?.kind === 'night') {
      result = {
        kind: 'night',
        entries: last.entries.map((e): NightEntryView =>
          e.playerId === me.id
            ? { self: true, ...e }
            : { self: false, playerId: e.playerId, diedId: e.diedId, protectedId: e.protectedId },
        ),
      }
    } else if (last?.kind === 'monthEnd') {
      result = { ...last, lostItems: { [me.id]: last.lostItems[me.id] ?? [] } }
    }
  }

  return {
    phase: state.phase,
    monthNumber: state.monthNumber,
    beat,
    beatIndex: state.month?.beatIndex ?? 0,
    beatCount: MONTH_BEATS.length,
    threat: state.threat,
    fragments: state.fragments,
    me: {
      id: me.id,
      name: me.name,
      alive: me.alive,
      items: me.items.map((id) => findItem(ctx, id)),
      hints: me.hints.map((id) => ctx.hints.find((h) => h.id === id)!),
    },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      acted: acted(p.id),
      ready: state.ready.includes(p.id),
    })),
    entity: entity && {
      code: entity.code,
      name: entity.name,
      type: entity.type,
      summary: entity.summary,
      // 소개가 끝나기 전에도 읽을 수 있게 모두 보낸다 (관찰 기록·매뉴얼은 공용 정보).
      observation: entity.observation,
      manual: entity.manual,
    },
    scene,
    result,
    ending: state.ending,
  }
}
