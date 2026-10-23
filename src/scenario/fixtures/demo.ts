// 엔진 시험용 작은 시나리오 (게임에는 들어가지 않는다). 시나리오 모드의 모든 기능을 한 번씩 쓴다:
// 무작위 값, 분할 장면(조합·정원·부상 제한·비공개 발견), 투표(동률·잠긴 선택지), 시계 마감, 전원 부상, 엔딩 여러 개.
import type { Scenario } from '../types.ts'

export const demo: Scenario = {
  id: 'demo',
  code: 'T-00',
  name: '시험용 건물',
  type: 'place',
  party: { min: 2, max: 4 }, // 메모를 읽는 사람과 뒤지는 사람이 따로 필요하다
  blurb: '엔진을 시험하기 위한 작은 건물.',
  summary: '현관문 하나, 방 하나. 문에는 색 이름으로 된 암호가 걸려 있다.',
  observation: ['현관문은 색 이름을 하나 말해야 열린다.'],
  manual: ['방 안의 물건은 두 사람 이상이 함께 살핀다.'],
  dossier: [
    { id: 'door', title: '현관문', lines: ['암호는 판마다 다르다.'] },
    { id: 'note', title: '메모', lines: ['메모의 글씨는 한 번 읽으면 잊히지 않는다.'], unlock: { hint: 'note' } },
  ],
  items: [
    { id: 'key', name: '열쇠', text: '작은 놋쇠 열쇠.' },
    { id: 'kit', name: '구급 상자', text: '붕대와 소독약.' },
  ],
  facts: [
    { id: 'note', text: '방 안의 메모에 현관문의 암호가 적혀 있다.' },
    { id: 'trap', text: '틀린 암호를 말하면 경보가 울려 시간이 흐른다.' },
  ],
  vars: [{ id: 'code', pick: ['빨강', '파랑', '초록'] }],
  clock: { labels: ['저녁', '밤', '새벽', '아침'] },
  deadline: { time: 3, node: 'late' },
  onAllHurt: 'wiped',
  start: 'start',
  nodes: [
    {
      id: 'start',
      kind: 'story',
      title: '입구',
      text: '낡은 건물 앞에 섰다. 문은 잠겨 있고, 옆 창문으로 방 하나가 보인다.',
      next: 'hub',
    },
    {
      id: 'hub',
      kind: 'split',
      title: '방',
      text: [
        { text: '방 안에는 책상과 서랍, 침대가 있다.' },
        { text: '누군가는 방을 지켜야 할 것 같다.', when: { time: { min: 1 } } },
      ],
      actions: [
        { id: 'read-note', text: '책상 위의 메모를 읽는다', max: 1 },
        { id: 'search-room', text: '서랍과 침대 밑을 뒤진다', needsHealthy: true, locked: '부상 때문에 몸을 굽힐 수 없다' },
        { id: 'guard', text: '문가에서 망을 본다' },
        { id: 'rest', text: '쉬면서 상처를 돌본다', when: { item: 'kit' }, locked: '구급 상자가 있어야 한다' },
      ],
      private: [
        {
          action: 'read-note',
          text: [
            { text: "메모에는 '{code}'라고 적혀 있다." },
            { text: '(이미 한 번 본 글씨다.)', when: { knows: 'note', by: 'me' } },
          ],
          effects: [{ learn: 'note', to: 'actor' }],
        },
        {
          action: 'search-room',
          when: { picked: 'guard' },
          text: '망을 보는 사람 덕분에 안심하고 서랍을 뒤져 열쇠를 찾았다.',
          effects: [{ give: 'key', to: 'actor' }],
        },
        {
          action: 'search-room',
          text: '서두르다 서랍에 손을 찧었지만 열쇠를 찾았다.',
          effects: [{ give: 'key', to: 'actor' }, { hurt: 'actor' }],
        },
        {
          action: 'rest',
          text: '붕대를 감고 숨을 골랐다.',
          effects: [{ heal: 'actor' }],
        },
      ],
      outcomes: [
        {
          when: { all: [{ picked: 'read-note' }, { picked: 'search-room' }] },
          text: '메모와 열쇠, 필요한 것은 모두 손에 넣었다.',
          effects: [{ time: 1 }, { flag: 'ready' }],
          next: 'door',
        },
        {
          text: '아직 부족하다. 시간이 흘렀다.',
          effects: [{ time: 1 }],
          next: 'hub',
        },
      ],
    },
    {
      id: 'door',
      kind: 'vote',
      title: '현관문',
      text: '문 앞에 모였다. 암호를 말해야 한다.',
      choices: [
        { id: 'red', text: '“빨강.”', next: [{ when: { var: 'code', is: '빨강' }, to: 'good' }, { to: 'trap' }] },
        { id: 'blue', text: '“파랑.”', next: [{ when: { var: 'code', is: '파랑' }, to: 'good' }, { to: 'trap' }] },
        { id: 'green', text: '“초록.”', next: [{ when: { var: 'code', is: '초록' }, to: 'good' }, { to: 'trap' }] },
        {
          id: 'use-key',
          text: '열쇠로 옆문을 연다',
          when: { item: 'key' },
          locked: '열쇠가 있어야 한다',
          result: '열쇠가 맞았다. 옆문이 삐걱 열렸다.',
          effects: [{ flag: 'side-door' }],
          next: 'side',
        },
      ],
    },
    {
      id: 'trap',
      kind: 'story',
      title: '경보',
      text: '문에서 날카로운 경보음이 울렸다. 한참이 지나서야 멈췄다.',
      onEnter: [{ time: 1 }],
      next: 'door',
    },
    { id: 'good', kind: 'ending', tier: 'true', title: '정문으로', text: '문이 열렸다. 바깥 공기가 상쾌했다.' },
    {
      id: 'side',
      kind: 'ending',
      tier: 'neutral',
      title: '옆문으로',
      text: [
        { text: '옆문으로 빠져나왔다.' },
        { text: '정문의 암호는 끝내 몰랐다.', when: { not: { knows: 'note', by: 'me' } } },
      ],
    },
    { id: 'late', kind: 'ending', tier: 'bad', title: '날이 밝았다', text: '시간이 다 되어 경비원이 순찰을 돌기 시작했다.' },
    { id: 'wiped', kind: 'ending', tier: 'bad', title: '전원 부상', text: '모두 다쳐서 더는 움직일 수 없었다.' },
  ],
}
