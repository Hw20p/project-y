# Project-Y (가칭)

1~4인 협동 추리 텍스트 게임. 규칙과 계획은 [DESIGN.md](DESIGN.md)에 있다.

방 코드로 모여(최대 4명) 방장이 지도에서 대상을 고르고, 각자 입사 배경을 골라 시작한다. 혼자 하는 모드는 따로 없고, 나중에 `party.min`이 1인 대상을 추가해 방에서 고르는 방식으로 할 예정이다.

## 명령

Node 22.12 이상. 엔진·서버·스크립트는 Node의 타입 제거 기능(`--experimental-strip-types`)으로 바로 돌린다.

```bash
npm install
npm run dev:all     # 서버(8787) + 화면(5174)을 한 번에
npm run dev         # 화면만 (http://localhost:5174)
npm run server      # 게임 서버만 (포트는 PORT 환경 변수, 기본 8787)
npm run nettest     # 서버 통합 테스트 (방 만들기·대상/입사 배경 고르기·시작·끊김·재접속·엔딩·다시 도전)
npm run scenario    # 시나리오 엔진·탐색기·B7 로비 테스트 (분할 장면·부상·개인 장면·마감·다시 도전·무작위 400판·전수 탐색·의도한 풀이)
npm run explore     # 등록된 시나리오를 전수 탐색: npm run explore -- [시나리오 id] [인원들, 예: 2,3] [--full]. 문제가 있으면 종료 코드 1 (B7 로비는 인원당 1분쯤)
npm run uitest      # 화면(시작 화면·대기실·시나리오 화면·탐색기) 렌더링 스모크 (브라우저 없이)
npm run build       # 타입 검사 + 빌드
npm run typecheck   # 타입 검사
npm run validate    # 시나리오·입사 배경 정적 검증 (장면 연결, 아이템·단서 id, 조건 등)
```

## 구조

```
src/
  scenario/  시나리오 엔진 (장면 그래프, 판정에 난수 없음, React·서버 무관)
    types·state·stats·logic·game·view·validate   형식, 상태(JSON), 스텟·입사 배경, 조건·효과, 진행(reduce), 사람별 화면, 검증
    explore.ts   전수 탐색기
    registry.ts  탐색·검증 대상 시나리오 목록 (개발용 시험 시나리오 포함)
    rng.ts       시드 기반 난수 (판마다 바뀌는 값에만 쓴다)
    fixtures/    시험용 시나리오 (방에서 고를 수 없고 빌드에도 안 들어간다)
  content/scenarios/  방에서 고를 수 있는 대상 (B7 로비). 새 대상은 파일을 하나 더하고 index.ts에 한 줄
  net/       클라이언트–서버 메시지 형식과 검증 (protocol.ts)
  ui/        React 화면: 시작 화면(App), 연출(Narration, fx), 브라우저 저장(storage), 화면이 서버를 쓰는 규격(client)
    room/      방: 대기실(Lobby, LobbyMap)과 서버 접속(useRemoteGame)
    scenario/  장면·결과·엔딩·파티 스텟·정보 패널
    dev/       개발 전용 화면(전수 탐색기·분기 그래프). 개발 서버의 시작 화면에만 버튼이 보이고 빌드에는 들어가지 않는다
server/      WebSocket 서버 (index.ts 연결, room.ts 방 로직, main.ts 실행)
scripts/     validate / smoke·night·explore-test(엔진 테스트) / b7-walkthrough / explore(탐색 CLI) / nettest / ui-smoke / dev-all
```
