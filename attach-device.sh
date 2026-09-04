#!/usr/bin/env bash
# 실기기(안드로이드)를 AI QA 데모에 붙인다 — **로컬 Mac 에서** 실행한다.
#
#   ./deploy/aiqa/attach-device.sh pair   <폰IP>:<페어링포트> <6자리코드>   # 처음 한 번만
#   ./deploy/aiqa/attach-device.sh connect <폰IP>:<디버깅포트>              # 이후 매번
#   ./deploy/aiqa/attach-device.sh list                                     # 붙어 있는 것
#   ./deploy/aiqa/attach-device.sh public <serial>[,<serial>...]            # 공개 화면에 열기
#   ./deploy/aiqa/attach-device.sh detach <serial>
#
# ## 왜 스크립트인가 — 화면에서 붙이지 않는 이유
#
# 데모 화면은 **주소를 아는 누구나** 열 수 있다. 거기에 "이 IP 로 붙어라" 단추를 두면
# 모르는 사람이 우리 컨테이너로 집 안 네트워크를 훑을 수 있고(붙는 주소를 자기가 정하니까),
# 자기 기기를 붙여 놓을 수도 있다. 그래서 **붙이는 일은 운영자만** 한다.
#
# 같은 이유로 붙였다고 바로 공개되지도 않는다 — 공개 화면에서 고를 수 있는 기기는
# `AIQA_PUBLIC_SERIALS` 에 적은 것뿐이고, 기본값은 에뮬레이터 하나다. 개인 폰이 붙어 있어도
# 목록에는 "잠김"으로만 보인다. 열려면 `public` 을 쓴다 — **그 순간부터 그 폰은 인터넷의
# 누구나 원격으로 조작할 수 있다.** 사진·메시지·계정이 열려 있는 기기라면 열지 말 것.
#
# ## 폰에서 먼저 할 일 (사람이 해야 한다)
#
#   1. 설정 → 개발자 옵션 → **무선 디버깅** 켜기
#   2. "페어링 코드로 기기 페어링" → 뜨는 **IP:포트**와 **6자리 코드**를 이 스크립트에 넘긴다
#   3. 페어링이 끝나면 무선 디버깅 화면에 **다른 포트**가 뜬다. 그게 `connect` 에 넣을 값이다
#
# 폰과 홈서버가 **같은 망**에 있어야 한다. 컨테이너는 도커 브리지에 있지만 집 LAN 으로는
# 나갈 수 있다(NAT). 폰 화면이 꺼지면 무선 디버깅이 끊기므로, 오래 붙여 둘 거면 화면을
# 켜 두거나 USB 로 꽂는다.
#
# ## USB 로 꽂는 경우
#
# 홈서버에 케이블로 꽂았다면 컨테이너에 USB 를 넘겨야 한다 — docker-compose.yml 의
# `devices:` 에 `/dev/bus/usb:/dev/bus/usb` 를 더하고 다시 띄운다. 그 뒤로는 `list` 에
# 그냥 보인다(페어링·connect 가 필요 없다).
set -euo pipefail

host=${HOME_SERVER_SSH:-heimdall-host}
cmd=${1:-list}

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
adb() { ssh "$host" "docker exec aiqa adb $*"; }

case "$cmd" in
    pair)
        target=${2:?"페어링 주소가 필요해요 — 폰의 무선 디버깅 화면에 뜨는 IP:포트"}
        code=${3:?"6자리 페어링 코드가 필요해요"}
        say "페어링 $target"
        # 코드를 표준입력으로 준다 — 명령줄에 두면 홈서버의 프로세스 목록에 남는다
        ssh "$host" "printf '%s\n' '$code' | docker exec -i aiqa adb pair '$target'"
        echo
        echo "페어링이 됐으면 이제 connect 를 한 번 더 하세요 (포트가 다릅니다):"
        echo "  ./deploy/aiqa/attach-device.sh connect <폰IP>:<디버깅포트>"
        ;;

    connect)
        target=${2:?"연결 주소가 필요해요 — 무선 디버깅 화면의 IP:포트"}
        say "연결 $target"
        adb "connect '$target'"
        adb "devices -l"
        echo
        echo "공개 화면에서 고르게 하려면:"
        echo "  ./deploy/aiqa/attach-device.sh public emulator-5554,$target"
        ;;

    detach)
        target=${2:?"끊을 주소가 필요해요"}
        say "연결 끊기 $target"
        adb "disconnect '$target'" || true
        adb "devices -l"
        ;;

    list)
        say "붙어 있는 기기"
        adb "devices -l"
        say "공개 화면에서 고를 수 있는 것"
        ssh "$host" "grep -E '^AIQA_PUBLIC_SERIALS=' ~/aiqa/.env 2>/dev/null || echo '(설정 없음 → 에뮬레이터만)'"
        ;;

    public)
        serials=${2:?"열어 줄 serial 이 필요해요 (쉼표로 여러 개). 에뮬레이터도 같이 적으세요"}
        cat <<MSG

  ⚠️  여기 적은 기기는 **인터넷의 누구나** 데모 화면에서 골라 원격으로 조작할 수 있게 됩니다.
      개인 폰이면 사진·메시지·로그인된 계정이 그대로 열립니다.
      테스트 전용 기기가 아니라면 그만두세요.

MSG
        read -r -p "  그래도 열까요? 그러면 'open' 이라고 적으세요: " answer
        [[ $answer == open ]] || { echo "  그만둡니다."; exit 1; }

        say "공개 목록 설정"
        ssh "$host" "
            set -e
            touch ~/aiqa/.env
            sed -i '/^AIQA_PUBLIC_SERIALS=/d' ~/aiqa/.env
            echo 'AIQA_PUBLIC_SERIALS=$serials' >> ~/aiqa/.env
            cd ~/aiqa && docker compose up -d
        "
        echo "  열림: $serials"
        ;;

    *)
        sed -n '2,40p' "$0"
        exit 1
        ;;
esac
