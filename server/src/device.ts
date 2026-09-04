// 에뮬레이터를 만지는 유일한 자리 — adb 한 겹 위의 얇은 껍데기.
//
// **기기는 한 대뿐이다** (AIQA_SERIAL, 기본 emulator-5554). 늘리지 않는다:
// 집 회선의 한 대짜리 홈서버에서 에뮬레이터는 코어와 메모리를 통째로 먹고, 두 대가
// 뜨는 순간 화면 프레임도 Maestro 실행도 같이 느려진다. 그래서 이 모듈은 serial 을
// 인자로 받지 않는다 — 부를 자리가 하나뿐이어야 한 대라는 게 지켜진다.

import { spawn } from 'node:child_process'

const SERIAL = process.env.AIQA_SERIAL ?? 'emulator-5554'
const ADB = process.env.AIQA_ADB ?? 'adb'

/** 샘플 앱. 설치·재실행이 이 값 하나를 본다 */
export const APP_ID = process.env.AIQA_APP_ID ?? 'com.example.demo.golmok'
export const APP_ACTIVITY = process.env.AIQA_APP_ACTIVITY ?? '.MainActivity'

/**
 * adb 가 하라는 대로 안 했을 때.
 *
 * 생성자에 `readonly code` 같은 매개변수 속성을 쓰지 않는다 — Node 의 타입 지우기
 * (`--experimental-strip-types`)는 **지우기만 하고 코드를 만들어 내지 않아서** 그 문법을
 * 통째로 거절한다(ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). 이 스택 전체가 그 모드로 돈다.
 */
export class AdbError extends Error {
    code: number | null

    constructor(message: string, code: number | null) {
        super(message)
        this.code = code
    }
}

type RunResult = { code: number | null; stdout: Buffer; stderr: string }

/**
 * 명령 하나를 돌리고 끝날 때까지 기다린다.
 *
 * **타임아웃이 항상 붙는다.** adb 는 기기가 반쯤 죽었을 때 조용히 영원히 매달리는데,
 * 그러면 프레임 루프가 통째로 멈춘다 — 화면이 굳은 것처럼 보이고 원인은 안 보인다.
 */
function run(cmd: string, args: string[], timeoutMs: number, shell = false): Promise<RunResult> {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { shell })
        const out: Buffer[] = []
        let err = ''
        let done = false

        const timer = setTimeout(() => {
            if (done) return
            done = true
            child.kill('SIGKILL')
            resolve({ code: null, stdout: Buffer.concat(out), stderr: `${err}\n(timeout ${timeoutMs}ms)` })
        }, timeoutMs)

        child.stdout.on('data', (d: Buffer) => out.push(d))
        child.stderr.on('data', (d: Buffer) => {
            // 표준에러는 몇 줄이면 충분하다. 죽은 기기가 같은 줄을 무한히 뱉는 일이 있다
            if (err.length < 8192) err += d.toString('utf8')
        })
        child.on('error', (e) => {
            if (done) return
            done = true
            clearTimeout(timer)
            resolve({ code: null, stdout: Buffer.alloc(0), stderr: String(e) })
        })
        child.on('close', (code) => {
            if (done) return
            done = true
            clearTimeout(timer)
            resolve({ code, stdout: Buffer.concat(out), stderr: err })
        })
    })
}

/** adb 한 번. 실패는 예외가 아니라 결과로 돌려준다 — 부르는 쪽이 대개 그냥 넘어간다 */
export async function adb(args: string[], timeoutMs = 10_000): Promise<RunResult> {
    return run(ADB, ['-s', SERIAL, ...args], timeoutMs)
}

/** 기기 안에서 셸 한 줄. 결과 문자열만 필요할 때 */
export async function shell(line: string, timeoutMs = 10_000): Promise<string> {
    const r = await adb(['shell', line], timeoutMs)
    return r.stdout.toString('utf8')
}

// ── 상태 ─────────────────────────────────────────────────────────────────────

export type DeviceState = {
    /** adb 가 기기를 보고 있나 */
    connected: boolean
    /** 부팅이 끝났나 (sys.boot_completed) */
    booted: boolean
    /** 샘플 앱이 깔려 있나 */
    appInstalled: boolean
    width: number
    height: number
}

let cachedSize: { width: number; height: number } | null = null

/**
 * 화면 크기. 브라우저의 클릭 좌표를 기기 좌표로 되돌리는 데 쓴다.
 *
 * 한 번 읽으면 캐시한다 — 이 데모에서 화면 크기는 AVD 설정이라 도중에 바뀌지 않고,
 * 매 프레임 `wm size` 를 부르면 그 왕복이 그대로 지연이 된다.
 */
export async function screenSize(): Promise<{ width: number; height: number }> {
    if (cachedSize) return cachedSize
    const out = await shell('wm size')
    // "Physical size: 720x1600" · override 가 있으면 "Override size: …" 가 뒤에 붙는다
    const all = [...out.matchAll(/(\d+)x(\d+)/g)]
    const last = all.at(-1)
    if (!last) return { width: 720, height: 1600 }
    cachedSize = { width: Number(last[1]), height: Number(last[2]) }
    return cachedSize
}

export async function state(): Promise<DeviceState> {
    const got = await run(ADB, ['-s', SERIAL, 'get-state'], 5_000)
    const connected = got.stdout.toString('utf8').trim() === 'device'
    if (!connected) return { connected: false, booted: false, appInstalled: false, width: 0, height: 0 }

    const boot = (await shell('getprop sys.boot_completed', 5_000)).trim()
    const booted = boot === '1'
    if (!booted) return { connected, booted, appInstalled: false, width: 0, height: 0 }

    const pkgs = await shell(`pm list packages ${APP_ID}`, 8_000)
    const size = await screenSize()
    return { connected, booted, appInstalled: pkgs.includes(APP_ID), ...size }
}

// ── 화면 ─────────────────────────────────────────────────────────────────────

/**
 * 한 장 찍어 JPEG 으로 돌려준다.
 *
 * **왜 PNG 를 그대로 안 보내나.** `screencap -p` 는 720x1600 한 장이 150~300KB 다.
 * 초당 서너 장이면 집 업로드 대역을 이것만으로 1MB/s 씩 먹는다. 같은 화면을 폭 `width`
 * 로 줄여 JPEG 으로 바꾸면 20~40KB 다 — 한 자리 숫자 배로 준다.
 *
 * **왜 screenrecord(h264) 가 아닌가.** 인코더가 한두 초를 물고 있다가 내놓는다. 화면만
 * 볼 때는 그게 더 곱지만, 여기서는 사람이 눌러 보는 자리라 **그 지연이 곧 조작감**이다.
 * 한 장씩 찍으면 늘 방금 화면이다.
 */
export async function screenshotJpeg(width: number, quality: number): Promise<Buffer | null> {
    // adb 와 ffmpeg 를 파이프로 잇는다 — 중간 파일도, PNG 를 Node 로 들여오는 왕복도 없다
    const pipeline =
        `${ADB} -s ${SERIAL} exec-out screencap -p | ` +
        `ffmpeg -hide_banner -loglevel error -f image2pipe -i pipe:0 ` +
        `-vf scale=${width}:-2 -q:v ${quality} -frames:v 1 -f mjpeg pipe:1`
    const r = await run('/bin/sh', ['-c', pipeline], 15_000)
    if (r.stdout.length === 0) return null
    return r.stdout
}

// ── 조작 ─────────────────────────────────────────────────────────────────────

export async function tap(x: number, y: number) {
    await adb(['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))], 8_000)
}

export async function swipe(x1: number, y1: number, x2: number, y2: number, ms: number) {
    await adb(
        [
            'shell',
            'input',
            'swipe',
            String(Math.round(x1)),
            String(Math.round(y1)),
            String(Math.round(x2)),
            String(Math.round(y2)),
            String(Math.round(ms)),
        ],
        8_000,
    )
}

export async function longPress(x: number, y: number) {
    await swipe(x, y, x, y, 600)
}

/**
 * 글자 넣기.
 *
 * `input text` 는 아스키만 안전하다 — 공백은 `%s` 로 바꿔야 하고, 따옴표·`$` 는 기기
 * 셸이 먼저 먹는다. 한글은 더 나빠서, adb 인자로 그냥 넘기면 도중에 깨진 채 들어간다.
 *
 * 그래서 **글자를 base64 로 기기에 옮겨 두고, 기기 안에서 되돌려 넣는다.** 이러면 우리
 * 셸도 기기 셸도 원문을 한 번도 해석하지 않는다 — 지나가는 것은 `A-Za-z0-9+/=` 뿐이다.
 */
export async function typeText(text: string) {
    if (/^[\x20-\x7e]*$/.test(text)) {
        // 아스키만 있으면 한 번으로 끝난다. 공백은 %s 로 바꿔야 `input` 이 한 낱말로 본다
        const escaped = text.replace(/(["'\\$`&|;<>()])/g, '\\$1').replace(/ /g, '%s')
        await adb(['shell', 'input', 'text', escaped], 10_000)
        return
    }
    const b64 = Buffer.from(text, 'utf8').toString('base64')
    await adb(['shell', `echo ${b64} | base64 -d > /data/local/tmp/aiqa-text`], 8_000)
    await adb(['shell', 'input text "$(cat /data/local/tmp/aiqa-text)"'], 12_000)
}

/** 하드웨어 키. 화면 아래 버튼 셋과 엔터·지우기가 여기로 온다 */
export async function key(name: string) {
    const allowed: Record<string, string> = {
        home: 'KEYCODE_HOME',
        back: 'KEYCODE_BACK',
        recent: 'KEYCODE_APP_SWITCH',
        enter: 'KEYCODE_ENTER',
        del: 'KEYCODE_DEL',
        tab: 'KEYCODE_TAB',
        volume_up: 'KEYCODE_VOLUME_UP',
        volume_down: 'KEYCODE_VOLUME_DOWN',
        power: 'KEYCODE_POWER',
    }
    const code = allowed[name]
    // 목록에 없는 이름은 버린다. 화면에서 온 값이 그대로 셸에 닿는 자리라 열어 둘 수 없다
    if (!code) return
    await adb(['shell', 'input', 'keyevent', code], 8_000)
}

/**
 * 같은 키를 여러 번. `input keyevent` 는 키코드를 여러 개 받아 준다 —
 * 한 번씩 adb 를 부르면 서른 번 지우는 데 왕복이 서른 번이고, 그게 그대로
 * "adb 갈래가 느리다"로 보인다.
 */
export async function keyRepeat(name: string, times: number) {
    const allowed: Record<string, string> = { del: 'KEYCODE_DEL', enter: 'KEYCODE_ENTER', back: 'KEYCODE_BACK' }
    const code = allowed[name]
    if (!code) return
    const n = Math.min(200, Math.max(1, Math.round(times)))
    await adb(['shell', 'input', 'keyevent', ...Array(n).fill(code)], 15_000)
}

// ── 앱 ───────────────────────────────────────────────────────────────────────

export async function installApk(apkPath: string) {
    const r = await adb(['install', '-r', '-g', apkPath], 180_000)
    const out = r.stdout.toString('utf8') + r.stderr
    if (!/Success/i.test(out)) throw new AdbError(`설치 실패: ${out.trim().slice(0, 500)}`, r.code)
}

/** 앱을 처음부터 다시 띄운다. 시나리오 사이를 깨끗하게 만드는 유일한 방법이다 */
export async function relaunchApp() {
    await adb(['shell', 'am', 'force-stop', APP_ID], 10_000)
    await adb(['shell', 'pm', 'clear', APP_ID], 15_000)
    await adb(['shell', 'am', 'start', '-n', `${APP_ID}/${APP_ACTIVITY}`], 15_000)
}

/** 지금 앞에 있는 화면(액티비티) 이름. 실패 원인을 볼 때 근거로 쓴다 */
export async function currentActivity(): Promise<string> {
    const out = await shell("dumpsys activity activities | grep -m1 'topResumedActivity'", 8_000)
    const m = out.match(/[\w.]+\/[\w.$]+/)
    return m ? m[0] : ''
}

// ── 화면에 무엇이 있나 ────────────────────────────────────────────────────────

export type UiNode = {
    text: string
    /** resource-id 의 뒷부분. Compose 의 testTag 가 여기로 나온다 */
    id: string
    desc: string
    clickable: boolean
    bounds: { left: number; top: number; right: number; bottom: number }
}

/**
 * 지금 화면의 요소 목록.
 *
 * **adb 갈래의 눈이다** — "이 글자를 누르라"는 지시를 좌표로 바꾸는 유일한 길이고,
 * 실패했을 때 LLM 에 넘기는 근거이기도 하다.
 *
 * `uiautomator dump /dev/tty` 로 파일을 거치지 않고 바로 받는다. `/sdcard` 에 떨어뜨렸다
 * 다시 당기면 왕복이 둘 늘고, 그만큼 adb 갈래가 느려 보인다 — 견주는 자리라 공정하지 않다.
 *
 * XML 파서를 들이지 않는다. uiautomator 가 내는 것은 속성만 있는 평평한 `<node .../>` 라
 * 정규식으로 충분하고, 이 스택은 의존성이 0이다.
 */
export async function dump(): Promise<UiNode[]> {
    const r = await adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], 20_000)
    const xml = r.stdout.toString('utf8')
    const nodes: UiNode[] = []
    for (const m of xml.matchAll(/<node\s([^>]*?)\/?>/g)) {
        const attrs = m[1]
        const at = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? ''
        const b = at('bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/)
        if (!b) continue
        nodes.push({
            text: decodeXml(at('text')),
            // "com.pkg:id/tag" 에서 뒤만 쓴다. 시나리오에 패키지 이름을 적게 하지 않으려는 것
            id: at('resource-id').split('/').pop() ?? '',
            desc: decodeXml(at('content-desc')),
            clickable: at('clickable') === 'true',
            bounds: { left: Number(b[1]), top: Number(b[2]), right: Number(b[3]), bottom: Number(b[4]) },
        })
    }
    return nodes
}

function decodeXml(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
}

/**
 * 화면에 실제로 보이는 글자들. 실패 원인을 LLM 에 물을 때와, 말로 시나리오를 만들 때
 * "고를 수 있는 말"로 같이 넘긴다.
 *
 * 스크린샷을 넘기지 않는 이유는 값이다 — 이미지 한 장은 토큰이 비싸고, "무엇이 안
 * 눌렸나"는 대개 글자 목록만 보면 안다.
 */
export async function visibleTexts(limit = 60): Promise<string[]> {
    const seen = new Set<string>()
    for (const n of await dump()) {
        for (const t of [n.text, n.desc]) {
            const v = t.trim()
            if (v && !seen.has(v)) seen.add(v)
            if (seen.size >= limit) return [...seen]
        }
    }
    return [...seen]
}
