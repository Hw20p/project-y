# Project-Y (가칭)

1~4인 협동 추리 텍스트 게임. 규칙과 계획은 [DESIGN.md](DESIGN.md)에 있다.

지금은 엔진 코어와 **1인 UI**가 있다 (멀티 서버는 다음 단계). 진행 상황은 브라우저(`localStorage`)에 저장된다.

## 명령

Node 22.12 이상. 엔진 스크립트는 Node의 타입 제거 기능(`--experimental-strip-types`)으로 바로 돌린다.

```bash
npm install
npm run dev         # 개발 서버 (http://localhost:5174)
npm run build       # 타입 검사 + 빌드
npm run typecheck   # 타입 검사
npm run validate    # 콘텐츠 검증 (아이템·단서 id, 선택지 조건, 진실 조각 수 등)
npm run smoke       # 규칙 스모크 테스트 (결정성, 비공개 정보, 잘못된 행동 무시)
npm run sim         # 봇 시뮬레이션: npm run sim -- [판 수] [시드]
```

## 구조

```
src/
  engine/    순수 TS 엔진 (React·서버 무관)
    types.ts     콘텐츠 타입 (대상, 선택지, 아이템, 단서)
    config.ts    밸런스 수치와 한 달의 장면 순서
    state.ts     게임 상태 (JSON 직렬화 가능)
    game.ts      createGame / reduce(행동 → 새 상태)
    view.ts      viewFor: 플레이어 한 명에게 보여 줄 화면용 상태 (비공개 정보 걸러냄)
    validate.ts  콘텐츠 검증
    simulate.ts  자동 플레이 봇과 집계
    rng.ts       시드 기반 난수
  ui/        React 화면. useLocalGame이 엔진을 브라우저에서 직접 돌리고 { view, send }를 돌려준다
  content/   게임 콘텐츠
    entities/    대상 파일 하나 = 대상 하나
    items.ts     아이템·단서 정의
    index.ts     콘텐츠 묶음 (대상을 추가하면 여기에 한 줄)
scripts/     validate / smoke / simulate
```
