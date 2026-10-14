# 호스팅 설정

HEIMDALL은 운영자가 선택한 서버와 도메인에서 실행해요. 조직별 운영 기록과 자격증명은 저장소 밖에서 관리해 주세요.

## 환경 설정

- `HEIMDALL_ALLOWED_HOSTS`: 접속을 허용할 호스트 이름을 쉼표로 구분해요. HTTPS 프록시가 Host·Origin을 전달해야 해요.
- `HEIMDALL_PUBLIC_URL`: 선택적인 공개 URL이에요. LLM 요청의 참조 주소로 사용해요.
- `HEIMDALL_EDGE_NETWORK`: 리버스 프록시와 연결할 기존 Docker 네트워크 이름이에요. 기본값은 `heimdall-edge`예요.
- `AIQA_WORKER_SECRET`, `AIQA_DB_PASSWORD`: 운영자가 준비하는 실행기·DB 자격증명이에요.
- `AIQA_TEST_USER_PASSWORD`, `AIQA_TEST_ADMIN_PASSWORD`: 초기 계정에 사용할 16자 이상의 비밀번호예요. 실제 값은 커밋하지 않아요.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: 프로필 이미지 저장을 사용할 때 설정해요. 운영자가 소유한 버킷 이름을 사용해요.

배포 스크립트는 `HEIMDALL_SSH_HOST`와 저장소 밖의 설정 파일 경로 `HEIMDALL_ENV_FILE`을 명시해야 실행돼요. 대상 Linux 호스트에는 Docker, KVM, 연결할 프록시 네트워크가 필요해요. 최초 배포에는 이미지·실행기·터미널 런타임 준비가 필요하며, 이 스크립트만으로 모든 환경을 설치하지는 않아요.

MCP SSH 설정의 `heimdall-host`는 예시 별칭이에요. 자신의 SSH 설정에 맞게 변경해 주세요. 기기 에이전트 ZIP은 Studio 의존성 설치 후 `node device-agent/build.ts`로 생성해요.

기존 복제본과 분리된 운영 저장소는 공개 이력을 다시 병합하지 않도록 관리해 주세요. 기록 재작성 후에는 기존 변경을 별도로 검토하고 새 복제본에서 작업해요.
