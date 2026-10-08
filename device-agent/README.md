# Heimdall 기기 에이전트

슬레이브에서 `heimdall server --master https://마스터주소`를 실행한다. 연결은 슬레이브 → 마스터 HTTP(S) 요청만 사용한다. 공개 포트와 SSH는 필요하지 않다. 10초 동안 heartbeat가 없으면 마스터가 해당 기기를 오프라인으로 표시한다.

## macOS 아키텍처

동일한 ZIP이 Apple Silicon(arm64)과 Intel(x64)을 지원한다. 실행 파일은 Node.js용 JavaScript 번들이며 특정 CPU용 바이너리나 절대 Homebrew 경로를 포함하지 않는다. 각 Mac 아키텍처에 맞는 Node.js와 Xcode/Simulator, Appium을 설치하고 PATH에서 실행한다. Simulator 런타임은 해당 Mac의 Xcode가 지원하는 버전을 사용한다. Apple Silicon에서 원격 연결을 확인했으며 Intel 실기기 실행은 아직 확인하지 않았다.

## macOS 설치

현재 패키지는 Node.js 22.18+에서 실행하는 CLI다. Node, Xcode/Simulator, Appium 3와 XCUITest 드라이버가 사전에 설치되어 있어야 한다. 폐쇄망에서는 이 도구들과 Simulator runtime도 반입해야 한다. 이 ZIP만으로 모든 의존성이 설치되지는 않는다.

1. ZIP을 풀고 `heimdall` 파일을 PATH에 두고 실행 권한을 준다.
2. `~/.config/heimdall/agent.json`에 아래 내용을 저장한다.
3. 관리자가 발급한 토큰을 `tokenFile`에 저장하고 해당 사용자만 읽게 한다.
4. Simulator를 부팅한 뒤 `heimdall server --master https://마스터주소`를 실행한다.

```json
{"id":"mac-01","tokenFile":"/Users/사용자/.config/heimdall/token","device":"SIMULATOR-UUID"}
```

`heimdall server --master ... --config /path/agent.json`으로 설정 경로를 바꿀 수 있다. Appium이 없다면 CLI가 실행 오류를 안내하며, 설치되어 있으면 loopback 4725에서 시작한다. 작업 종료는 Ctrl+C다. Mac 절전/네트워크 해제 때 자동 재접속한다. 평문 HTTP는 격리된 신뢰망에서만 사용하고 일반 연결은 HTTPS를 사용한다.

## 마스터 등록

마스터의 `server/agents.local.json` 또는 `HEIMDALL_AGENTS_FILE`에 에이전트별 ID, 토큰 SHA-256 해시, 허용된 serial을 등록한다. 토큰 원문은 서버 응답/배포 패키지에 포함하지 않는다. 설정은 요청마다 읽으므로 수정 후 서버 재시작은 필요 없다.

```json
{"agents":[{"id":"mac-01","tokenHash":"TOKEN_SHA256_HEX","serials":["ios:SIMULATOR-UUID"]}]}
```

서버 실행 계정이 이 설정을 읽을 수 있어야 한다. 같은 serial을 여러 에이전트에 허용하지 않는다. 사용자 브라우저는 기존 Heimdall 로그인과 기기 점유 권한을 그대로 사용한다. 마스터는 임의 쉘 명령 대신 prepare/frame/action 명령만 전송한다.

## 지원 범위

현재 macOS iOS Simulator의 화면, 탭, 스와이프, 홈, 텍스트/삭제, 화면 캡처·녹화를 연결한다. iOS 웹 인스펙터와 잠금·볼륨·최근 앱 버튼은 아직 지원하지 않는다. Windows용 Android adapter/패키지는 준비 중이며 iOS Simulator는 macOS 전용이다.

## 개발/빌드

`node deploy/aiqa/device-agent/build.ts` (저장소 루트). 빌드에는 기존 studio의 esbuild가 필요하지만 생성된 CLI는 JS 의존성을 번들에 포함한다. 회귀검사는 이 명령에서 실행하지 않는다.

현재 연결 Mac은 Xcode 26.2 / XCUITest 12.16.0이다. Xcode 26.2에 없는 lib_TestingInterop.dylib의 WDA 프로젝트 복사 항목을 로컬 설치본에서 제외해 WDA를 빌드했다. 다른 Mac은 Xcode와 드라이버의 호환성을 확인해야 한다. Xcode 자체나 서명 자격증명은 변경하지 않았다.

운영 관리자 화면의 기기관리에서 macOS ZIP을 받을 수 있다. 에이전트 다운로드 API는 관리자 세션을 확인한다. 화면은 최대 1200px JPEG로 전송하여 기본 프록시 업로드 제한 안에 유지한다. 현재 Mac에는 사용자 LaunchAgent로 실행되어 로그인 상태에서 재접속한다. Windows 배포물은 아직 제공하지 않는다.

2026-10-08 운영 반영: 로컬 Mac의 iPhone 17 Pro가 공개 마스터에 등록되고 웹 원격 화면으로 수신되는 것을 확인했다. 에이전트는 사용자 LaunchAgent `com.example.heimdall-agent`로 유지한다. 회귀검사는 실행하지 않았고 studio 빌드와 서버 TypeScript 컴파일만 수행했다.
