# heimdall Studio

React 19 + TypeScript + shadcn/ui + Tailwind v4. 기존 Node.js API, WebSocket, PostgreSQL, Appium, Playwright와 연결한다. 별도의 프런트엔드 서버 없이 esbuild 결과를 기존 Node 서버에서 제공한다.

## 접속 경로

| 용도 | 경로 |
| --- | --- |
| 앱·로그인 | `/`, `/login` |
| API | `/aiqa/api/studio/*` |
| 빌드 정적 파일 | `/aiqa/studio/assets/*` |
| WebSocket | `/aiqa/studio/ws` |

비로그인 상태로 접속하면 로그인 화면으로 이동해요.

## 모듈

| 경로 | 책임 |
| --- | --- |
| `src/app` | 화면 구성·기능 연결 |
| `src/features/auth` | 전용 로그인·프로필 이미지·비밀번호 변경 |
| `src/features/projects` | 프로젝트 홈·생성·설정 |
| `src/features/dashboard` | 실제 최근 기록 통계·유형 커버리지 |
| `src/features/devices` | 실제 기기 목록·플랫폼·준비 상태 |
| `src/features/board` | 프로젝트별 화면 배치·빈 프로젝트 타일 초기화 |
| `src/features/sessions` | 세션 생성·탐색·시작 화면 |
| `src/features/workspace` | 세션 상태·실시간 연결·명령 수행 |
| `src/features/execution` | 실시간 화면·직접 조작 |
| `src/features/agent` | AI 목표·중단·재개·검증 |
| `src/features/debugging` | 실행 기록·증적·콘솔·화면 요소·API |
| `src/features/scenarios` | 코드·JSONL·시나리오 내보내기 |
| `src/features/integrations` | MCP 설정 |
| `src/components` | 공통 PageHeader·PlatformIcon·브랜드 표시 |
| `src/components/ui` | shadcn/ui 기본 컴포넌트 |
| `../contracts` | 클라이언트·서버·워커 API 계약 |
| `../server/src/studio/domain` | 세션 타입·동작 검증·코드 생성 |
| `../server/src/studio/application` | 세션·실행·AI·재실행 유스케이스 |
| `../server/src/studio/engines` | 브라우저·Appium 어댑터 |
| `../server/src/studio/infrastructure` | DB·LLM·이벤트·환경 설정 |
| `../server/src/studio/transport` | HTTP·WebSocket·MCP |

## 화면 빌드

Node.js 24에서 이 디렉터리를 기준으로 실행해요.

```sh
node ../tools/yarn-4.18.0.cjs install --immutable
node --experimental-strip-types build.ts
```

`../web/studio/`는 빌드 산출물이에요. 직접 편집하지 않고 소스를 수정해 다시 빌드해요. UI 변경은 [디자인 기준](DESIGN.md)을 따라요. 플랫폼 로고 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에서 확인할 수 있어요.
