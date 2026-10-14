#!/usr/bin/env bash
set -euo pipefail

host=${HEIMDALL_SSH_HOST:?Set HEIMDALL_SSH_HOST}
env_file=${HEIMDALL_ENV_FILE:?Set HEIMDALL_ENV_FILE to a local private environment file}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
build=false
[[ ${1:-} == --build ]] && build=true

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

source "$here/tools/preflight.sh"
require_main_merged "$here"

say "React Studio 검증·빌드"
if [[ ${AIQA_SKIP_REGRESSION_TESTS:-0} == 1 ]]; then
  node --experimental-strip-types "$here/studio/build.ts"
else
  node --experimental-strip-types "$here/check.ts"
fi

payload=$(mktemp -d)
trap 'rm -rf "$payload"' EXIT

mkdir -p "$payload/aiqa"
cp -R "$here/server" "$here/web" "$here/flows" "$here/sample-app" "$here/browser-worker" "$here/contracts" "$payload/aiqa/"
cp "$here/Dockerfile" "$here/docker-compose.yml" "$here/entrypoint.sh" "$payload/aiqa/"
rm -rf "$payload/aiqa/server/node_modules" "$payload/aiqa/server/.yarn"
rm -rf "$payload/aiqa/browser-worker/node_modules" "$payload/aiqa/browser-worker/.yarn"
cp "$here/tools/yarn-4.18.0.cjs" "$payload/aiqa/yarn.cjs"
rm -rf "$payload/aiqa/sample-app/.gradle" "$payload/aiqa/sample-app/build" "$payload/aiqa/sample-app/app/build"

[[ -f "$env_file" ]] || { echo "Environment file not found" >&2; exit 1; }
umask 077
cp "$env_file" "$payload/aiqa/.env"

say "서버($host)로 보내는 중"
COPYFILE_DISABLE=1 tar --no-xattrs -cf - -C "$payload" aiqa \
    | ssh "$host" 'tar -xf - -C ~ && find ~/aiqa -name "._*" -delete && chmod +x ~/aiqa/entrypoint.sh'

ssh "$host" 'rm -f ~/aiqa/web/index.html ~/aiqa/web/app.js ~/aiqa/web/app.css ~/aiqa/web/copy.json'

ssh "$host" '
    cd ~/aiqa
    if [ ! -f db.env ]; then
        (umask 077; echo "AIQA_DB_PASSWORD=$(openssl rand -hex 24)" > db.env)
        echo "  ~/aiqa/db.env 새로 만들었습니다"
    fi
    cat db.env >> .env
'

if $build; then
    say "이미지 빌드 (처음이면 20~40분)"
    kvm_gid=$(ssh "$host" 'getent group kvm | cut -d: -f3')
    ssh "$host" "cd ~/aiqa && docker build --build-arg KVM_GID=${kvm_gid:-992} -t aiqa:latest ."
else
    say "이미지는 그대로 둡니다 (--build 로 다시 구울 수 있어요)"
fi

say "컨테이너 반영"
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

say "배포 완료 — 설정한 공개 주소에서 로그인과 기기 연결을 확인해 주세요"
