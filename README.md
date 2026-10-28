# Project-Y (가칭)

1~8인 협동 추리 텍스트 게임. 규칙과 계획은 [DESIGN.md](DESIGN.md)에 있다.

방 코드로 모여(최대 8명) 방장이 지도에서 대상을 고르고, 각자 입사 배경을 골라 시작한다. 혼자 하는 모드는 따로 없고, `party.min`이 1인 대상(지금은 자판기)을 방에서 골라 혼자 시작하는 방식이다.

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
npm run build:server # 게임 서버를 하나의 JS 파일(dist-server/main.mjs)로 묶는다 (배포용)
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
    backdrop/  장면 뒤의 배경 그림: 장소 × 낮밤 × 정전(Backdrop), 그림 파일 찾기(files). 그림 파일이 없는 장소는 기존 배경만 보인다
  assets/backdrops/  배경 그림을 넣는 곳 (<시나리오 id>/<장소>.webp). 넣기만 하면 붙는다 — README.md에 장소 목록과 규격이 있다
  assets/audio/  소리 파일을 넣는 곳 (sfx/·bgm/). 파일 이름이 소리 id이고, 넣기만 하면 붙는다 — README.md에 목록이 있다 (엔진은 ui/audio.ts)
    dev/       개발 전용 화면(전수 탐색기·분기 그래프). 개발 서버의 시작 화면에만 버튼이 보이고 빌드에는 들어가지 않는다
server/      WebSocket 서버 (index.ts 연결, room.ts 방 로직, main.ts 실행)
deploy/      서버 설정 예시 (nginx.conf.example, project-y.service). 서버에 직접 두는 파일이다
scripts/     validate / smoke·night·explore-test(엔진 테스트) / b7-walkthrough / explore(탐색 CLI) / nettest / ui-smoke / dev-all
```

## 배포

Project-X와 달리 **정적 파일만 올리는 것으로는 안 된다.** 방을 이어 주는 게임 서버(Node 프로세스)가 계속 떠 있어야 해서, 같은 서버에 둘을 나란히 둔다.

```
브라우저 ──https──▶ nginx ─┬─ /      → 정적 파일 (dist)           /home/deploy/apps/project-y/web
                           └─ /ws    → 127.0.0.1:8787 (게임 서버)  systemd 서비스 `project-y`
```

화면은 배포된 주소의 `/ws`로 접속한다 (https 아래에서는 자동으로 `wss`). 개발 중(`npm run dev`)에는 예전처럼 같은 호스트의 8787 포트다. 다른 주소로 붙이고 싶으면 빌드할 때 `VITE_WS_URL`을 준다.

### 자동 배포 (GitHub Actions)

`main`에 push하면 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)이 빌드(타입체크 포함)·시나리오 검증·서버 통합 시험을 돌리고, 모두 통과하면 SSH로 서버에 올려 `project-y` 서비스를 다시 시작한다. 하나라도 실패하면 배포되지 않는다. Actions 탭에서 수동 실행도 된다. 저장소 Settings → Secrets에 Project-X와 같은 값을 넣는다.

| 이름 | 값 |
| --- | --- |
| `SSH_HOST` | 서버 주소 |
| `SSH_USER` | 접속 계정 (`deploy`) |
| `SSH_PRIVATE_KEY` | 배포용 SSH 개인 키 |

### 서버 준비 (한 번만)

1. **도메인**: 쓸 주소(예: `y.example.com`)의 DNS A 레코드를 서버로 향하게 한다.
2. **Node 20 이상**: `node --version`으로 확인한다. 서버 코드는 배포할 때 하나의 JS 파일(`main.mjs`)로 묶어서 올리므로 Node를 따로 올리거나 서버에서 `npm install`을 할 필요가 없다.
3. **폴더**: `mkdir -p /home/deploy/apps/project-y`
4. **서비스 등록**: [deploy/project-y.service](deploy/project-y.service)를 `/etc/systemd/system/`에 복사하고 `sudo systemctl daemon-reload && sudo systemctl enable project-y`. (node 경로가 `/usr/bin/node`가 아니면 파일 안의 `ExecStart`를 고친다.) 첫 배포가 끝난 뒤에 `start`가 된다.
5. **재시작 권한**: 배포 계정이 비밀번호 없이 이 서비스만 다시 시작할 수 있게 `sudo visudo -f /etc/sudoers.d/project-y`에 `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart project-y`를 넣는다.
6. **nginx**: [deploy/nginx.conf.example](deploy/nginx.conf.example)을 `/etc/nginx/sites-available/`에 복사해 `server_name`을 바꾸고 켠 뒤 `sudo nginx -t && sudo systemctl reload nginx`. 그다음 `sudo certbot --nginx -d <도메인>`으로 HTTPS를 붙인다. WebSocket용 `/ws` 블록이 꼭 있어야 한다.
7. 방화벽은 80/443만 열면 된다. 게임 서버 포트(8787)는 `127.0.0.1`에만 묶여 있어서 바깥에서 닿지 않는다.

그다음 `main`에 push(또는 수동 실행)하면 첫 배포가 된다. 확인:

```bash
systemctl status project-y        # 돌고 있는지
journalctl -u project-y -f        # 서버 로그
```

### 알아 둘 것

- 방은 서버 메모리에만 있어서 **배포(재시작)하면 진행 중인 방이 모두 사라진다.** 플레이 중에는 배포하지 않는 편이 좋다.
- 이전 서버 파일은 `app-old`로 하나 남는다. 문제가 생기면 `app`과 바꾸고 서비스를 다시 시작하면 된다.
- 서버 인스턴스는 하나만 돌린다 (방이 프로세스 메모리에 있어서 여러 개로 나누면 방 코드가 서로 안 보인다).

