// 엔진 시험용: 스텟·개인 장면(고른 것이 각자에게 적용, 혼자 이어지는 단계)·정신을 잃음. 게임에는 들어가지 않는다.
import type { Scenario } from '../types.ts'

export const night: Scenario = {
  id: 'night',
  code: 'T-01',
  name: '시험용 밤',
  type: 'place',
  blurb: '밤을 시험하는 작은 건물.',
  summary: '낡은 건물의 지하에는 무언가 있다.',
  observation: ['지하에서 물 떨어지는 소리가 난다.'],
  manual: ['정신을 잃으면 진정시켜 줘야 한다.'],
  items: [{ id: 'lamp', name: '손전등', text: '작은 손전등.' }],
  facts: [
    { id: 'drip', text: '지하의 물소리는 일정한 박자다.' },
    { id: 'mark', text: '지하 막다른 벽에 오래된 표식이 새겨져 있다.' },
  ],
  clock: { labels: ['낮', '밤', '새벽'] },
  onAllPanic: 'collapse',
  start: 'start',
  nodes: [
    { id: 'start', kind: 'story', title: '도착', text: '해가 저물었다. 각자 할 일을 정해야 한다.', next: 'night' },
    {
      id: 'night',
      kind: 'personal',
      title: '밤',
      text: [
        { text: '건물은 조용하다. 각자 무엇을 할지 정한다.' },
        { text: '(눈이 침침하다.)', when: { stat: 'sanity', max: 3, by: 'me' } },
      ],
      options: [
        { id: 'train', text: '몸을 단련한다', effects: [{ stat: 'body', add: 1, to: 'actor' }], result: '밤새 몸을 움직였다.' },
        {
          id: 'rest',
          text: '숨을 고르며 마음을 가라앉힌다',
          calming: true,
          effects: [{ stat: 'sanity', add: 4, to: 'actor' }],
          result: '숨을 골랐다. 마음이 가라앉았다.',
        },
        {
          id: 'lucky',
          text: '서랍을 뒤진다',
          when: { stat: 'luck', min: 3, by: 'actor' },
          locked: '운이 따라야 찾을 수 있을 것 같다',
          effects: [{ give: 'lamp', to: 'actor' }],
          result: '서랍 안쪽에서 손전등을 찾았다.',
        },
        {
          id: 'cellar',
          text: '지하실로 내려가 본다',
          later: [{ stat: 'sanity', add: -1, to: 'actor' }],
          then: 'cellar-1',
        },
      ],
      steps: [
        {
          id: 'cellar-1',
          text: '지하실은 어둡고, 벽에서 물 떨어지는 소리가 난다.',
          choices: [
            {
              id: 'listen',
              text: '숨을 죽이고 소리에 귀를 기울인다',
              when: { stat: 'insight', min: 3, by: 'actor' },
              locked: '섬세한 귀가 필요하다',
              result: '물소리는 일정한 박자였다.',
              effects: [{ learn: 'drip', to: 'actor' }],
              then: 'cellar-2',
            },
            {
              id: 'press',
              text: '더 깊이 들어간다',
              result: '축축한 계단을 끝까지 내려갔다.',
              later: [{ stat: 'sanity', add: -3, to: 'actor' }],
              then: 'cellar-2',
            },
            { id: 'back', text: '돌아간다', result: '발길을 돌렸다.' },
          ],
        },
        {
          id: 'cellar-2',
          text: '막다른 벽에 오래된 표식이 새겨져 있다.',
          effects: [{ learn: 'mark', to: 'actor' }],
        },
      ],
      next: 'day',
    },
    {
      id: 'day',
      kind: 'vote',
      title: '아침',
      text: '아침이 밝았다. 표식을 어떻게 할까.',
      choices: [
        {
          id: 'push',
          text: '벽을 민다',
          result: '벽이 열렸다. 안쪽에서 찬 바람이 불어 나왔다.',
          later: [{ stat: 'sanity', add: -3, to: 'all' }],
          next: 'corridor',
        },
        { id: 'wait', text: '날이 저물기를 기다린다', next: 'quiet' },
      ],
    },
    {
      id: 'corridor',
      kind: 'story',
      title: '벽 너머의 복도',
      text: '복도는 끝이 보이지 않는다. 걸을수록 귀가 먹먹해졌다.',
      next: 'hall',
    },
    { id: 'hall', kind: 'ending', tier: 'true', title: '벽 너머', text: '벽 너머에는 아무것도 없었다. 그것이 좋았다.' },
    { id: 'quiet', kind: 'ending', tier: 'neutral', title: '조용한 아침', text: '아무 일도 없이 하루가 지났다.' },
    { id: 'collapse', kind: 'ending', tier: 'bad', title: '정신 상실', text: '모두 정신을 잃고 쓰러졌다.' },
  ],
}
