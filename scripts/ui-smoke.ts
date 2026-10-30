// 화면 스모크 테스트: 브라우저 없이 Vite로 화면 모듈을 불러와 서버 쪽 렌더링(문자열)으로 에러 없이 그려지는지 확인한다.
// (서버를 띄우지 않고 모듈만 읽는다. 상호작용은 확인하지 못하고, 그려지는 구조와 글자만 본다.)
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { exploreScenario } from '../src/scenario/explore.ts'
import { demo } from '../src/scenario/fixtures/demo.ts'
import { b7Lobby } from '../src/content/scenarios/b7-lobby.ts'
import { night } from '../src/scenario/fixtures/night.ts'
import { partyOf } from '../src/scenario/registry.ts'
import { createScenarioGame, reduceScenario, type ScenarioAction } from '../src/scenario/game.ts'
import { viewForScenario } from '../src/scenario/view.ts'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
  // 개발 서버와 같은 설정으로 읽는다 (import.meta.env.DEV가 참)
})

try {
  // 서버 쪽 렌더링이라 브라우저 전역을 흉내 낸다
  const store = new Map<string, string>()
  const memory = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
  Object.assign(globalThis, {
    location: { search: '', hostname: 'localhost', protocol: 'http:', origin: 'http://localhost', pathname: '/' },
    localStorage: memory,
    sessionStorage: memory,
  })

  // react는 Node가 직접 불러오고, 앱 모듈은 Vite가 읽는다 (같은 react를 쓴다)
  const render = (el: unknown): string => renderToStaticMarkup(el as never)

  // 1) 분기 그래프: 모든 장면 상자와 길이 그려진다
  {
    const { GraphView } = await vite.ssrLoadModule('/src/ui/dev/GraphView.tsx')
    for (const sc of [demo, night, b7Lobby]) {
      // 큰 시나리오(B7)는 일부만 봐도 그래프가 그려지는지만 확인한다
      const report = exploreScenario(sc, { players: partyOf(sc.party?.min ?? 2), maxStates: 3000, full: false })
      const html = render(h(GraphView as never, { sc, report }))
      assert.match(html, /<svg/)
      for (const n of sc.nodes) assert.ok(html.includes(`· ${n.id}`), `${sc.id}: 장면 ${n.id} 상자가 그려진다`)
      assert.equal((html.match(/<path d="M\d+,\d+ C/g) ?? []).length >= report.graph.edges.length, true, '모든 길이 그려진다')
    }
    console.log('통과: 분기 그래프 렌더링')
  }

  // 2) 탐색기 화면: 처음 상태(시나리오 선택·인원·시작 버튼·정적 검증 표시)가 그려진다
  {
    const { default: ExplorerPage } = await vite.ssrLoadModule('/src/ui/dev/ExplorerPage.tsx')
    const html = render(h(ExplorerPage as never, { onBack: () => {} }))
    assert.match(html, /시나리오 전수 탐색기/)
    assert.match(html, /탐색 시작/)
    assert.match(html, /A-02 B7 로비/)
    assert.match(html, /T-00 시험용 건물/)
    assert.match(html, /T-01 시험용 밤/)
    assert.match(html, /개발 전용/)
    console.log('통과: 탐색기 화면 렌더링')
  }

  // 3) 시작 화면: 개발 환경에서는 탐색기 버튼이 보인다 (서버 쪽 렌더링이라 브라우저 전역을 흉내 낸다)
  {
    const { default: App } = await vite.ssrLoadModule('/src/ui/App.tsx')
    const html = render(h(App as never))
    assert.match(html, /\[개발\] 시나리오 전수 탐색기/)
    assert.match(html, /방 만들기/)
    console.log('통과: 시작 화면(개발 버튼 표시)')

    // 본문 글자 연출: 문장 단위로 나뉘고, 효과 범위는 문장 안의 글자 위치로 옮겨지며, 표기는 글에서 사라진다
    const { splitBeats } = await vite.ssrLoadModule('/src/ui/Narration.tsx')
    const beats = splitBeats('문이 [[whisper|조용히]] 닫혔다. 불이 깜빡였다. [[shake|하나가 더 있었다.]]\n끝.')
    assert.deepEqual(beats.map((b: { text: string }) => b.text), ['문이 조용히 닫혔다.', '불이 깜빡였다.', '하나가 더 있었다.', '끝.'])
    assert.deepEqual(beats[0].spans, [{ fx: 'whisper', start: 3, end: 6 }])
    assert.deepEqual(beats[2].spans, [{ fx: 'shake', start: 0, end: beats[2].text.length }])
    assert.equal(beats[3].para, true, '줄바꿈은 문단 나눔')
    assert.ok(beats.every((b: { text: string }) => !b.text.includes('[[')), '효과 표기는 글에 남지 않는다')
    console.log('통과: 글자 연출 표기(문장 나눔·효과 범위)')

    // 새 글자 효과(메아리·거울상·검은 줄)와 엔딩 연출 이름은 검증기가 아는 이름이다
    const { FX_NAMES, ENDING_FX_NAMES } = await vite.ssrLoadModule('/src/scenario/fx.ts')
    for (const name of ['echo', 'mirror', 'redact']) assert.ok(FX_NAMES.includes(name), `글자 효과 ${name}`)
    assert.deepEqual([...ENDING_FX_NAMES], ['phantom', 'tally'])

    // 엔딩 하나에만 붙는 연출: 한 명이 더(인원 N+1)와 정산(진열된 칸 번호·정산 완료)
    const { EndingParty } = await vite.ssrLoadModule('/src/ui/scenario/EndingParty.tsx')
    const crew = [
      { id: 'p1', name: '가', archetype: 'researcher', stats: { sanity: 6, body: 1, insight: 4 }, hurt: false, panic: false },
      { id: 'p2', name: '나', archetype: 'field', stats: { sanity: 2, body: 4, insight: 1 }, hurt: false, panic: false },
    ]
    const phantom = render(h(EndingParty as never, { fx: 'phantom', players: crew }))
    assert.match(phantom, /파티 2명/)
    assert.match(phantom, /파티 3명/, '없던 한 명이 늘어난 인원이 보인다')
    assert.match(phantom, /방금 서명했다/)
    const tally = render(h(EndingParty as never, { fx: 'tally', players: crew }))
    assert.match(tally, /A-01/)
    assert.match(tally, /A-02/)
    assert.match(tally, /정산 완료/)
    console.log('통과: 엔딩 연출(한 명이 더·정산)')

    // 엔딩 뒤 회고: 요약(며칠째·의문·단서·놓친 곳)과 사람별 활약도·칭호
    const { EndingRecapPanel } = await vite.ssrLoadModule('/src/ui/scenario/EndingRecap.tsx')
    const zero = { clues: 0, firsts: 0, items: 0, probes: 0, hurt: 0, sanityLost: 0 }
    const recapHtml = render(
      h(EndingRecapPanel as never, {
        meId: 'p1',
        recap: {
          days: 3,
          clues: 7,
          questions: { solved: 2, total: 3 },
          probes: { taken: 5, missed: 4 },
          players: [
            { id: 'p1', name: '가', archetype: 'researcher', ...zero, clues: 4, firsts: 3, probes: 3, score: 23, share: 0.7, title: { name: '첫 발견자', desc: '설명' } },
            { id: 'p2', name: '나', archetype: 'field', ...zero, score: 0, share: 0.3, title: null },
          ],
        },
      }),
    )
    assert.match(recapHtml, /이번 판 회고/)
    assert.match(recapHtml, /3일째에 끝났다/)
    assert.match(recapHtml, /의문 2\/3 풀림/)
    assert.match(recapHtml, /알아낸 단서 7개/)
    assert.match(recapHtml, /아무도 살피지 않은 곳이 4곳/)
    assert.match(recapHtml, /첫 발견자/)
    assert.match(recapHtml, /활약 70%/)
    assert.match(recapHtml, /단서 4 \(먼저 3\)/)
    assert.match(recapHtml, /눈에 띄는 기록이 없다/, '기록이 없는 사람도 에러 없이 그려진다')
    console.log('통과: 엔딩 뒤 회고 화면')
  }

  // 4) 시나리오 화면: B7 로비를 두 사람이 끝까지 진행하며, 장면 종류·개인 단계·결과·엔딩마다 화면이 에러 없이 그려지는지 본다
  {
    const { ScenarioScreen } = await vite.ssrLoadModule('/src/ui/scenario/ScenarioScreen.tsx')
    const { FxProvider } = await vite.ssrLoadModule('/src/ui/fx.tsx')
    const { Lobby } = await vite.ssrLoadModule('/src/ui/room/Lobby.tsx')
    const sc = b7Lobby
    let g = createScenarioGame(sc, {
      seed: 1,
      players: [
        { id: 'p1', name: '가', archetype: 'researcher' },
        { id: 'p2', name: '나', archetype: 'field' },
      ],
      vars: { seat: 'b', stairs: 11 },
    })
    const act = (a: ScenarioAction) => (g = reduceScenario(sc, g, a))

    const seen = new Set<string>()
    let sawGrowth = false
    const renderFor = (id: string) => {
      const view = viewForScenario(sc, g, id)
      const sig = [id, view.phase, view.scene?.kind, !!view.scene?.solo, view.scene?.mineDone, !!view.scene?.myChoiceId, view.result?.kind, !!view.aftermath.length, !!view.scene?.choices.some((c) => c.hints?.length)].join('|')
      if (seen.has(sig)) return
      seen.add(sig)
      const client = {
        view,
        send: () => {},
        reading: ['p2'],
        setReading: () => {},
        online: { p1: true, p2: false },
        roomCode: 'ABCD',
        isHost: id === 'p1',
        reconnecting: false,
        journalKey: 'ui-smoke',
        force: () => {},
        retry: () => {},
        rematch: () => {},
      }
      const html = render(
        h(FxProvider as never, null, h(ScenarioScreen as never, { client, onExit: () => {}, exitLabel: '나가기' })),
      )
      assert.ok(html.length > 500, `화면이 그려진다: ${sig}`)
      assert.ok(!html.includes('undefined'), `"undefined" 글자가 화면에 나오지 않는다: ${sig}`)
      assert.ok(!html.includes('[object'), `"[object" 글자가 화면에 나오지 않는다: ${sig}`)
      // 밤의 선택지가 주는 성장(체력 +1, 정신력 +3 …)은 고르기 전에 알려 준다 (서술이 흐른 뒤에야 선택지가 그려지므로 화면이 아니라 보기에서 확인한다)
      if (view.scene?.choices.some((c) => c.hints?.includes('체력 +1'))) sawGrowth = true
    }

    /** 지금 할 수 있는 첫 행동 (nettest의 step과 같은 규칙) */
    const next = (id: string): ScenarioAction | null => {
      const v = viewForScenario(sc, g, id)
      const me = v.players.find((p) => p.id === id)!
      if (v.phase === 'story' || v.phase === 'result') return me.ready ? null : { type: 'ready', playerId: id }
      const s2 = v.scene
      if (!s2) return null
      if (v.phase === 'vote' && !s2.myChoiceId && !v.me.panic) {
        const c = s2.choices.find((x) => !x.locked)
        return c ? { type: 'vote', playerId: id, choiceId: c.id } : null
      }
      if (v.phase === 'split' && !s2.myChoiceId) {
        const c = s2.choices.find((x) => !x.locked && !x.full)
        return c ? { type: 'pick', playerId: id, actionId: c.id } : null
      }
      if (v.phase === 'personal') {
        if (s2.solo) {
          const c = s2.solo.choices.find((x) => !x.locked)
          return c ? { type: 'solo', playerId: id, choiceId: c.id } : { type: 'ready', playerId: id }
        }
        if (!s2.myChoiceId && !s2.mineDone) {
          // 개인 단계가 이어지는 선택지를 우선 골라 본다 (엘리베이터·계단)
          const c = s2.choices.find((x) => !x.locked && (x.id === 'near-light' || x.id === 'near-desk')) ?? s2.choices.find((x) => !x.locked)
          return c ? { type: 'pick', playerId: id, actionId: c.id } : null
        }
      }
      return null
    }

    for (let i = 0; i < 400 && g.run.phase !== 'ended'; i++) {
      renderFor('p1')
      renderFor('p2')
      let moved = false
      for (const id of ['p1', 'p2']) {
        const a = next(id)
        if (a) {
          act(a)
          moved = true
          renderFor('p1')
        }
      }
      if (!moved) act({ type: 'force' })
    }
    assert.equal(g.run.phase, 'ended')
    renderFor('p1')
    renderFor('p2')
    act({ type: 'retry' })
    renderFor('p1')

    assert.ok(sawGrowth, '밤 장면에 체력 +1 성장 표시가 나왔다')
    // 8명 파티: 작은 카드로 줄어들고 접을 수 있다. 2~4명은 큰 카드 그대로이고 접을 수 있으며, 혼자는 카드 없이 한 줄이라 접기가 없다
    {
      const big = createScenarioGame(sc, { seed: 1, players: partyOf(8), vars: { seat: 'b', stairs: 11 } })
      const bigClient = {
        view: viewForScenario(sc, big, 'p1'),
        send: () => {},
        reading: [],
        setReading: () => {},
        online: {},
        roomCode: 'ABCD',
        isHost: true,
        reconnecting: false,
        journalKey: 'ui-smoke-8',
        force: () => {},
        retry: () => {},
        rematch: () => {},
      }
      const html8 = render(h(FxProvider as never, null, h(ScenarioScreen as never, { client: bigClient, onExit: () => {}, exitLabel: '나가기' })))
      assert.match(html8, /파티 8명/)
      assert.match(html8, /접기/)
      assert.equal((html8.match(/aria-label="파티원"/g) ?? []).length, 1)
      const renderN = (n: number) =>
        render(h(FxProvider as never, null, h(ScenarioScreen as never, { client: { ...bigClient, view: viewForScenario(sc, createScenarioGame(sc, { seed: 1, players: partyOf(n), vars: { seat: 'b', stairs: 11 } }), 'p1') }, onExit: () => {}, exitLabel: '나가기' })))
      const html4 = renderN(4)
      assert.match(html4, /파티 4명/)
      assert.match(html4, /접기/, '2명부터는 파티를 접을 수 있다')
      const html1 = renderN(1)
      assert.ok(!html1.includes('접기'), '혼자일 때는 접기 버튼이 없다')
      assert.equal((html1.match(/aria-label="파티원"/g) ?? []).length, 0, '혼자일 때는 파티원 목록 대신 한 줄이다')
    }

    // 내 개인 행동은 끝났는데 다른 사람을 기다리는 화면: B7에는 이어지는 개인 단계가 없어서 시험용 밤으로 만든다
    // (한 사람은 바로 끝나는 선택, 다른 사람은 이어지는 선택을 한다)
    let sawWaiting = [...seen].some((x) => x.split('|')[4] === 'true')
    {
      const crew = [
        { id: 'p1', name: '가', archetype: 'researcher' },
        { id: 'p2', name: '나', archetype: 'field' },
      ]
      let ng = createScenarioGame(night, { seed: 1, players: crew })
      const nact = (a: ScenarioAction) => (ng = reduceScenario(night, ng, a))
      nact({ type: 'ready', playerId: 'p1' })
      nact({ type: 'ready', playerId: 'p2' })
      nact({ type: 'pick', playerId: 'p1', actionId: 'train' })
      nact({ type: 'pick', playerId: 'p2', actionId: 'cellar' })
      const nv = viewForScenario(night, ng, 'p1')
      assert.equal(nv.scene?.mineDone, true, '시험용 밤: 내 행동은 끝났고 다른 사람을 기다린다')
      const waitClient = {
        view: nv,
        send: () => {},
        reading: [],
        setReading: () => {},
        online: { p1: true, p2: true },
        roomCode: 'ABCD',
        isHost: true,
        reconnecting: false,
        journalKey: 'ui-smoke-wait',
        force: () => {},
        retry: () => {},
        rematch: () => {},
      }
      const nhtml = render(h(FxProvider as never, null, h(ScenarioScreen as never, { client: waitClient, onExit: () => {}, exitLabel: '나가기' })))
      assert.ok(nhtml.length > 500 && !nhtml.includes('undefined') && !nhtml.includes('[object'), '개인 행동이 끝난 화면이 에러 없이 그려진다')
      sawWaiting = true
    }

    const phases = new Set([...seen].map((x) => x.split('|')[1]))
    for (const p of ['story', 'personal', 'split', 'vote', 'result', 'ended']) assert.ok(phases.has(p), `${p} 단계 화면을 그려 봤다`)
    assert.ok([...seen].some((x) => x.includes('|true|')), '개인 단계(혼자 진행)')
    assert.ok(sawWaiting, '개인 행동이 끝난 화면')
    assert.ok([...seen].some((x) => x.endsWith('|true')), '여파가 있는 화면')

    // 대기실: 시나리오 고르기·입사 배경
    const lobby = {
      t: 'lobby',
      code: 'ABCD',
      you: 'p1',
      hostId: 'p1',
      mode: 'b7-lobby',
      modes: [
        { id: 'b7-lobby', code: 'A-02', name: 'B7 로비', type: 'place', blurb: '소개', party: { min: 2, max: 4 }, map: { x: 44, y: 66 } },
        { id: 'next', code: 'A-03', name: '다음 곳', type: 'creature', blurb: '다른 소개', party: { min: 1, max: 4 }, map: { x: 78, y: 30 } },
      ],
      members: [
        { id: 'p1', name: '가', online: true, archetype: 'researcher' },
        { id: 'p2', name: '나', online: true, archetype: 'rookie' },
      ],
    }
    const lobbyHtml = render(h(Lobby as never, { lobby, notice: null, onStart: () => {}, onLeave: () => {}, onMode: () => {}, onArchetype: () => {} }))
    assert.match(lobbyHtml, /B7 로비/)
    assert.match(lobbyHtml, /조사 지도/)
    assert.match(lobbyHtml, /다음 곳/)
    assert.ok(!lobbyHtml.includes('월 사이클'), '월 사이클 버튼은 없다')
    assert.match(lobbyHtml, /이 곳으로 정했다/, '정해진 곳의 소개 카드가 보인다')
    assert.match(lobbyHtml, /연구원 출신/)
    assert.match(lobbyHtml, /조사를 시작한다 \(2명\)/)
    const solo = render(h(Lobby as never, { lobby: { ...lobby, members: [lobby.members[0]] }, notice: null, onStart: () => {}, onLeave: () => {}, onMode: () => {}, onArchetype: () => {} }))
    assert.match(solo, /2명 이상이 함께해야 한다/)
    console.log(`통과: 시나리오 화면 렌더링 (서로 다른 화면 ${seen.size}종) · 대기실`)
  }
} finally {
  await vite.close()
}
