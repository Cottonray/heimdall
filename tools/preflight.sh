#!/usr/bin/env bash
# 배포 전 확인 — **워크트리가 main 보다 뒤처졌으면 멈춘다.**
#
# 왜 필요한가 (2026-09-07 에 실제로 났다):
# 홈서버 데모의 deploy.sh 들은 git 을 보지 않는다. **각자 워크트리의 `server/`·`web/` 을
# 그대로 복사해서** 홈서버에 덮어쓴다. 그래서 병행 세션이 둘 있으면 이런 일이 난다 —
#
#   A 세션: nl2sql 을 고쳐 main 에 머지하고 배포한다
#   B 세션: main 을 안 당긴 자기 워크트리에서 배포한다
#   → 배포판에서 **A 의 작업이 통째로 사라진다.** 커밋은 살아 있으니 아무도 눈치채지 못하고,
#     다음에 누가 화면을 열어 볼 때까지 그대로 간다.
#
# 실제로 nl2sql 에서 두 세션이 서로를 두 번 덮었다. 사람이 매번 기억하는 것으로는 못 막는다.
# 그래서 스크립트가 스스로 본다: **내가 배포하려는 경로에, main 에는 있고 나에게는 없는
# 커밋이 있나.** 있으면 그 목록을 보여 주고 멈춘다.
#
# 쓰는 법 — 각 deploy.sh 가 일 시작 전에 한 줄:
#
#     source "$(dirname "${BASH_SOURCE[0]}")/../lib/preflight.sh"
#     require_main_merged "$here"
#
# 빠져나가는 길:
#   DEPLOY_SKIP_MAIN_CHECK=1 ./deploy/…/deploy.sh   # 일부러 되돌릴 때만
#   DEPLOY_MAIN_REF=origin/other                    # main 말고 다른 가지를 기준으로
#
# **커밋하지 않은 변경은 막지 않는다.** 고쳐 보고 바로 올려 보는 것이 이 데모들의 일상이다.
# 여기서 보는 것은 "남의 것을 지우는가" 하나뿐이다.
#
# **먼저 밟은 곳이 있다.** `infra/homeserver/edge/deploy.sh` 가 2026-09-05 에 같은 사고를
# 하루 두 번 내고(`/jjlove` 마운트가 날아가 404 · AI BA 리다이렉트가 되돌아갈 뻔) 같은 검사를
# 자기 안에 넣었다(`EDGE_SKIP_FRESHNESS=1`). 거기서 나온 교훈이 docs/pitfalls.md 에 적혀
# 있다 — "체크아웃 전체를 밀어넣는 배포 스크립트는 최신 여부를 스스로 확인해야 한다."
# 이 파일은 그 교훈을 나머지 데모 여섯에 편 것이다. edge 는 트리가 달라(infra/) 자기 것을
# 그대로 두었다 — 고치려면 두 곳을 다 본다.

# **`say` 를 쓰지 않는다.** macOS 에는 `/usr/bin/say`(음성 합성)가 있고, 이 파일을 bash 가
# 아닌 셸에서 source 하면 함수가 없을 때 그 명령이 대신 불린다 — 확인하려다 Mac 이 한국어를
# 소리 내어 읽었다 (2026-09-07). 겹치지 않을 이름을 쓰고 늘 우리가 정의한다.
_preflight_say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

# $1 = 배포할 디렉터리의 절대경로 (보통 각 스크립트의 $here)
require_main_merged() {
    local dir=$1
    local ref=${DEPLOY_MAIN_REF:-origin/main}

    if [[ ${DEPLOY_SKIP_MAIN_CHECK:-} == 1 ]]; then
        printf '  \033[33m※ main 확인을 건너뜁니다 (DEPLOY_SKIP_MAIN_CHECK=1)\033[0m\n'
        return 0
    fi

    local root
    if ! root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null); then
        printf '  \033[33m※ git 저장소가 아니라 main 확인을 건너뜁니다\033[0m\n'
        return 0
    fi
    local rel=${dir#"$root"/}
    [[ "$dir" == "$root" ]] && rel="."

    _preflight_say "main 과 어긋나지 않았나 ($rel)"
    # 네트워크가 없다고 배포까지 막지는 않는다 — 못 봤다는 것만 밝힌다
    if ! git -C "$root" fetch --quiet origin main 2>/dev/null; then
        printf '  \033[33m※ origin 을 못 읽어 확인하지 못했습니다. 최신인지 직접 보세요\033[0m\n'
        return 0
    fi
    if ! git -C "$root" rev-parse --verify --quiet "$ref" >/dev/null; then
        printf '  \033[33m※ %s 가 없어 확인을 건너뜁니다\033[0m\n' "$ref"
        return 0
    fi

    local missing
    missing=$(git -C "$root" rev-list --count "HEAD..$ref" -- "$rel")
    if [[ $missing == 0 ]]; then
        echo "  최신입니다 (이 경로에 $ref 만 가진 커밋 없음)"
        return 0
    fi

    printf '\n\033[1;31m!! 멈춥니다 — %s 에 있고 이 워크트리에 없는 커밋이 %s개 있습니다.\033[0m\n' "$ref" "$missing"
    echo   "   이대로 배포하면 그 작업이 배포판에서 지워집니다 (deploy.sh 는 git 이 아니라"
    echo   "   워크트리를 그대로 복사합니다)."
    echo
    git -C "$root" log --oneline --no-decorate "HEAD..$ref" -- "$rel" | sed 's/^/     /'
    echo
    echo   "   이렇게 푸세요:"
    echo   "     git -C $root merge origin/main     # 또는 pull --rebase"
    echo   "     (충돌이 나면 풀고) 다시 이 스크립트를 돌립니다"
    echo
    echo   "   일부러 되돌리는 중이라면: DEPLOY_SKIP_MAIN_CHECK=1 을 붙여 다시 돌리세요."
    return 1
}
