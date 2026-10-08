#!/usr/bin/env bash
# AI QA 데모를 홈서버에 반영한다 — **로컬 Mac 에서** 실행한다.
#
#   ./deploy/aiqa/deploy.sh            # 소스만 보내고 갈아끼운다 (보통 이것)
#   ./deploy/aiqa/deploy.sh --build    # 이미지까지 다시 굽는다 (Dockerfile·샘플 앱을 고쳤을 때)
#
# 홈서버에는 이 저장소를 보는 CI 가 없다 (홈 Jenkins 는 ai-sdlc·이력 관리시스템·안드로이드
# 빌드만 안다). 그래서 반영은 이 스크립트 하나다 — deploy/aicc/deploy.sh 와 같은 방식이다.
#
# **첫 빌드는 오래 걸린다** (Android SDK·시스템 이미지 ~3GB + gradle 의존성). 20~40분을
# 본다. 그 뒤로는 캐시가 받쳐 준다 — 샘플 앱만 고치면 apk 단계부터, 서버 소스만 고치면
# 아예 빌드 없이 파일 복사로 끝난다.
#
# **키는 저장소에 없다.** 정본은 메인서버 /opt/example/services/deploy/aiqa/.env 하나이고,
# 이 스크립트가 배포할 때마다 거기서 꺼내 홈서버로 내려놓는다 (AICC 와 같은 규약).
#
# nginx 경로(/aiqa)는 여기가 아니라 ./infra/homeserver/edge/deploy.sh 가 반영한다.
#
# 되돌리기: 홈서버에서 `cd ~/aiqa && docker compose down`
set -euo pipefail

host=${HOME_SERVER_SSH:-heimdall-host}
main=${MAIN_SERVER_SSH:-config-host}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
build=false
[[ ${1:-} == --build ]] && build=true

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

# --- 배포 전 확인 -------------------------------------------------------------
# deploy.sh 는 git 이 아니라 **이 워크트리를** 그대로 복사한다. main 보다 뒤처진 채 배포하면
# 남의 작업이 배포판에서 지워진다 (2026-09-07 에 nl2sql 에서 두 번 났다).
source "$here/../lib/preflight.sh"
require_main_merged "$here"

# --- 보낼 것 모으기 ----------------------------------------------------------
payload=$(mktemp -d)
trap 'rm -rf "$payload"' EXIT

mkdir -p "$payload/aiqa"
cp -R "$here/server" "$here/web" "$here/flows" "$here/sample-app" "$here/browser-worker" "$payload/aiqa/"
cp "$here/Dockerfile" "$here/docker-compose.yml" "$here/entrypoint.sh" "$payload/aiqa/"
# 로컬에서 yarn install 을 돌려 봤다면 node_modules 가 딸려 간다. 이미지 안에서 새로 깐다
rm -rf "$payload/aiqa/server/node_modules" "$payload/aiqa/server/.yarn"
rm -rf "$payload/aiqa/browser-worker/node_modules" "$payload/aiqa/browser-worker/.yarn"
# Yarn 은 저장소가 고정한 판(frontend/.yarnrc.yml 의 yarnPath) 그대로 쓴다. corepack 금지
cp "$here/../../frontend/.yarn/releases/yarn-4.18.0.cjs" "$payload/aiqa/yarn.cjs"
# gradle 이 만든 찌꺼기를 들고 가지 않는다 — 빌드는 저쪽 컨테이너 안에서 새로 한다
rm -rf "$payload/aiqa/sample-app/.gradle" "$payload/aiqa/sample-app/build" "$payload/aiqa/sample-app/app/build"

# --- 설정 (메인서버가 정본) ---------------------------------------------------
say "메인서버($main)에서 설정 가져오는 중"
env_body=$(ssh "$main" 'sudo -n cat /opt/example/services/deploy/aiqa/.env 2>/dev/null || true')

if [[ -z $env_body ]]; then
    cat >&2 <<'MSG'
!! 메인서버에 /opt/example/services/deploy/aiqa/.env 가 없어요.
   원격 조작·시나리오 실행·두 갈래 견주기는 그대로 되고, **말로 시나리오 만들기와
   실패 원인 요약만** 꺼진 채 뜹니다 (화면이 그렇게 밝힙니다).

   넣는 값 하나 (docs/aiqa.md 참고):
     AIQA_OPENROUTER_API_KEY=...   # AICC·ai-sdlc 와 같은 OpenRouter 계정 키

   넣는 법:
     ssh config-host "sudo -n install -d -m 700 /opt/example/services/deploy/aiqa \
       && sudo -n tee /opt/example/services/deploy/aiqa/.env >/dev/null \
       && sudo -n chmod 600 /opt/example/services/deploy/aiqa/.env" < 로컬에_적어둔_.env
MSG
fi

umask 077
printf '%s\n' "$env_body" > "$payload/aiqa/.env"

# --- 보내기 ------------------------------------------------------------------
# macOS 의 tar 는 확장속성을 `._파일` 로 같이 싼다. 도커 빌드 컨텍스트에 그 찌꺼기가 섞이면
# COPY 가 쓰레기 파일까지 들고 간다 (retype 워커에서 실제로 밟았다).
say "홈서버($host)로 보내는 중"
COPYFILE_DISABLE=1 tar --no-xattrs -cf - -C "$payload" aiqa \
    | ssh "$host" 'tar -xf - -C ~ && find ~/aiqa -name "._*" -delete && chmod +x ~/aiqa/entrypoint.sh'

# tar는 삭제된 파일을 지우지 않는다. 폐기한 구형 콘솔 네 파일만 명시적으로 제거한다.
ssh "$host" 'rm -f ~/aiqa/web/index.html ~/aiqa/web/app.js ~/aiqa/web/app.css ~/aiqa/web/copy.json'

# --- DB 비밀번호 (홈서버에만 있다) --------------------------------------------
# aiqa-db 의 비밀번호는 저장소에도 메인서버에도 없다. 홈서버 ~/aiqa/db.env 에 처음 한 번 만들고,
# 배포마다 .env(방금 메인서버 것으로 덮였다) 뒤에 덧붙인다. **db.env 를 지우면 안 된다** —
# Postgres 는 비밀번호를 볼륨이 처음 만들어질 때만 읽어서, 새로 만든 값으로는 붙지 못한다.
ssh "$host" '
    cd ~/aiqa
    if [ ! -f db.env ]; then
        (umask 077; echo "AIQA_DB_PASSWORD=$(openssl rand -hex 24)" > db.env)
        echo "  ~/aiqa/db.env 새로 만들었습니다"
    fi
    cat db.env >> .env
'

# --- 굽기 --------------------------------------------------------------------
if $build; then
    say "이미지 빌드 (처음이면 20~40분)"
    # KVM 그룹 번호는 호스트마다 다르다. 여기서 읽어 넘긴다 — 이미지 안 사용자가
    # 그 그룹에 들어가야 /dev/kvm 을 열 수 있다
    kvm_gid=$(ssh "$host" 'getent group kvm | cut -d: -f3')
    ssh "$host" "cd ~/aiqa && docker build --build-arg KVM_GID=${kvm_gid:-992} -t aiqa:latest ."
else
    say "이미지는 그대로 둡니다 (--build 로 다시 구울 수 있어요)"
fi

say "컨테이너 반영"
# **--force-recreate 를 뺄 수 없다.** 서버 소스는 마운트라 파일만 바꿔서는 이미 떠 있는
# node 가 새 코드를 읽지 않는데, 설정이 그대로면 `up -d` 는 "이미 최신"이라며 아무것도
# 하지 않는다 — 배포가 성공했다고 말하면서 옛 코드가 계속 도는 자리다 (2026-09-04 에
# 두 번 헤맸다). 에뮬레이터가 같이 다시 뜨는 값(1분)을 치르고 확실히 갈아끼운다.
ssh "$host" 'cd ~/aiqa && docker compose build aiqa-browser && docker compose up -d aiqa-db && docker compose up -d --no-deps --force-recreate aiqa aiqa-browser'

say "기동 확인 (에뮬레이터 부팅까지 1~3분)"
ssh "$host" '
    for i in $(seq 1 40); do
        if docker exec aiqa wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
            echo "  healthz ok"
            break
        fi
        sleep 3
    done
    docker exec aiqa wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || {
        echo "!! 2분 안에 서버가 살아나지 않았어요 — docker logs aiqa" >&2
        docker logs --tail 60 aiqa >&2
        exit 1
    }
    echo "  기기 상태:"
    for i in $(seq 1 60); do
        state=$(docker exec aiqa adb -s emulator-5554 get-state 2>/dev/null | tr -d "\r\n")
        boot=$(docker exec aiqa adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d "\r\n ")
        if [ "$boot" = "1" ]; then echo "    부팅 완료"; break; fi
        sleep 5
    done
    docker exec aiqa adb -s emulator-5554 shell pm list packages com.aidemo.golmok 2>/dev/null \
      | sed "s/^/    /" || echo "    (샘플 앱 아직 없음)"
'

say "바깥 경로 확인"
ssh "$main" '
    code=$(curl -sS -o /dev/null -w "%{http_code}" https://qa.example/aiqa/)
    cfg=$(curl -sS -o /dev/null -w "%{http_code}" https://qa.example/aiqa/api/config)
    studio=$(curl -sS -o /dev/null -w "%{http_code}" https://gateway.example/aiqa/studio/)
    printf "  구형 화면=%s  구형 API=%s  Studio 로그인=%s\n" "$code" "$cfg" "$studio"
    test "$code" = 410 && test "$cfg" = 410 && test "$studio" = 302
'

say "완료 — https://gateway.example/aiqa/studio/"
