# Codex 테스트 시나리오

AI 시나리오 실행은 실제 Codex CLI 0.146.0의 독립 대화로 처리한다. 한 실행의 반복 단계는 같은 thread를 resume한다. 실행이 끝나면 임시 HOME과 프로세스를 정리한다. 이어서 실행하면 저장된 해당 시나리오의 목표·관찰·최근 기록을 새 독립 대화에 제공한다.

## 권한 경계

- 모델은 파일·셸·브라우저·MCP·배포 도구를 받지 않는다. Codex의 Responses 요청을 전용 loopback 게이트웨이가 AI 설정의 Chat Completions 연결로 변환한다. upstream 요청에는 도구 정의가 없으며 tool_calls 응답을 거부한다. 응답은 assistant 텍스트 이벤트로만 Codex에 돌려준다. 따라서 프롬프트에만 의존한 권한 제한이 아니다.
- 실제 AI 키는 게이트웨이의 서버 메모리에만 존재한다. Codex에는 실행마다 발급하는 loopback 전용 임시 토큰과 비어 있는 임시 HOME을 전달한다. 사용자 Codex 설정·MCP·hooks를 가져오지 않는다. 첫 실행은 read-only sandbox다.
- 결과 JSON은 기존 validateAction과 URL 정책을 통과한 뒤 선택된 세션의 테스트 실행기로 처리한다. 임의 생성 코드를 eval하거나 셸에서 실행하지 않는다. 시나리오마다 `runs/studio/<UUID>/scenario.spec.ts` 또는 `scenario.appium.ts`만 서버 생성기가 갱신한다.
- 실행당 최대 12단계, Codex 응답당 최대 90초. 실제 검증 동작 성공 없이 통과로 판정하지 않는다. 사람 개입·종료 이후 도착한 결과는 epoch 검사로 실행하지 않는다.

## 코드 보기

Playwright/Appium TypeScript는 동일한 생성기를 화면·내보내기·시나리오 파일에 사용한다. 세션 동작 갱신에 맞춰 코드가 갱신된다. 실행 기록·디버깅 탭은 제거하고 API 도구는 유지한다. Android 내보내기도 동작 JSON 대신 Appium 코드다.

## 운영

실행 파일 기본 경로는 `/opt/aiqa/server/codex/bin/codex`이며 `AIQA_CODEX_BIN`으로 지정할 수 있다. npm 공식 `@openai/codex@0.146.0-linux-x64` 배포물의 SHA-512 integrity 검증 후 vendor 디렉터리를 server/codex에 설치한다. 바이너리는 Git에 커밋하지 않는다. 서버 소스 배포 후 서비스 재시작이 필요하다.

검증: 실제 로컬 Codex CLI와 mock 제공자로 thread resume 2회, 제공자 인증 헤더 전달, upstream 도구 정의 미전달을 확인했다. 전체 검사와 Appium 코드/문자열 이스케이프·API 내보내기 회귀 검사를 수행한다.
