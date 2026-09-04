// 기기를 만지는 유일한 자리 — adb 한 겹 위의 얇은 껍데기.
//
// **한 번에 한 대를 본다.** 화면 스트림도, 조작 권한도, 시나리오 실행기도 하나뿐이라
// 대상도 하나여야 한다. 그래서 이 모듈은 함수마다 serial 을 받지 않고 **지금 보는 기기**
// 하나를 들고 있고, `setTarget()` 으로 그걸 바꾼다.
//
// **에뮬레이터는 여전히 한 대만 띄운다** — 집 회선의 홈서버에서 두 대가 뜨면 화면 프레임도
// 실행도 같이 느려진다. 하지만 **실기기는 우리 CPU 를 쓰지 않으므로** 그 제한과 무관하다.
// 붙는 기기 수에는 제한을 두지 않고, 보는 대상만 하나로 묶는다 (docs/aiqa.md §실기기).
//
// 캐시(화면 크기·원본 프레임 머리말·마지막 덤프)는 **기기마다 따로 둔다.** 하나로 두면
// 대상을 바꾸는 순간 옛 기기의 해상도로 좌표를 계산해 엉뚱한 데를 누른다.

import { spawn } from 'node:child_process'

/** 지금 보는 기기. 시작값은 늘 에뮬레이터다 — 그게 상시로 떠 있는 쪽이다 */
let SERIAL = process.env.AIQA_SERIAL ?? 'emulator-5554'
const ADB = process.env.AIQA_ADB ?? 'adb'

export function target(): string {
    return SERIAL
}

/** 보는 기기를 바꾼다. 캐시가 기기별이라 여기서 지울 것이 없다 */
export function setTarget(serial: string) {
    SERIAL = serial
}

/** 기기마다 따로 두는 것들 */
type DeviceCache = {
    size: { width: number; height: number } | null
    raw: { offset: number; width: number; height: number } | null
    rawProbed: boolean
    lastDump: { nodes: UiNode[]; at: number } | null
}

const caches = new Map<string, DeviceCache>()

function cache(): DeviceCache {
    let c = caches.get(SERIAL)
    if (!c) {
        c = { size: null, raw: null, rawProbed: false, lastDump: null }
        caches.set(SERIAL, c)
    }
    return c
}

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
        // 표준에러도 조각으로 온다. 조각마다 따로 문자열로 바꾸면 한글이 걸친 자리에서
        // 깨지므로(3바이트가 두 조각에 나뉜다) 여기서도 바이트로 모았다 한 번에 푼다
        const errChunks: Buffer[] = []
        let errBytes = 0
        let done = false

        const timer = setTimeout(() => {
            if (done) return
            done = true
            child.kill('SIGKILL')
            resolve({ code: null, stdout: Buffer.concat(out), stderr: `${errText()}\n(timeout ${timeoutMs}ms)` })
        }, timeoutMs)

        const errText = () => Buffer.concat(errChunks).toString('utf8')

        child.stdout.on('data', (d: Buffer) => out.push(d))
        child.stderr.on('data', (d: Buffer) => {
            // 표준에러는 몇 줄이면 충분하다. 죽은 기기가 같은 줄을 무한히 뱉는 일이 있다
            if (errBytes < 8192) {
                errChunks.push(d)
                errBytes += d.length
            }
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
            resolve({ code, stdout: Buffer.concat(out), stderr: errText() })
        })
    })
}

/**
 * adb 한 번. 실패는 예외가 아니라 결과로 돌려준다 — 부르는 쪽이 대개 그냥 넘어간다.
 *
 * `global` 은 기기를 고르지 않는 명령(`devices`·`connect`)을 위한 것이다. 그런 명령에
 * `-s` 를 붙이면 adb 가 통째로 거절한다.
 */
export async function adb(args: string[], timeoutMs = 10_000, global = false): Promise<RunResult> {
    return run(ADB, global ? args : ['-s', SERIAL, ...args], timeoutMs)
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

/**
 * 화면 크기. 브라우저의 클릭 좌표를 기기 좌표로 되돌리는 데 쓴다.
 *
 * 한 번 읽으면 캐시한다 — 이 데모에서 화면 크기는 AVD 설정이라 도중에 바뀌지 않고,
 * 매 프레임 `wm size` 를 부르면 그 왕복이 그대로 지연이 된다.
 */
export async function screenSize(): Promise<{ width: number; height: number }> {
    const c = cache()
    if (c.size) return c.size
    const out = await shell('wm size')
    // "Physical size: 720x1600" · override 가 있으면 "Override size: …" 가 뒤에 붙는다
    const all = [...out.matchAll(/(\d+)x(\d+)/g)]
    const last = all.at(-1)
    if (!last) return { width: 720, height: 1600 }
    c.size = { width: Number(last[1]), height: Number(last[2]) }
    return c.size
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
 * 원본 프레임을 어떻게 받을지. 한 번만 재고 그 뒤로는 그 값을 쓴다.
 *
 * `screencap -p` 는 **기기 안에서 PNG 로 압축한다** — 그 압축이 통째로 낭비다.
 * 우리는 어차피 JPEG 으로 다시 만드니까. 압축하지 않은 `screencap` 은 4.6MB 를 그대로
 * 내놓지만 adb 는 로컬 소켓이라 그 전송이 PNG 압축보다 싸다.
 * 홈서버 실측: PNG 길 860ms · 원본 길 **512ms** (같은 화면·같은 결과 22KB).
 */
/**
 * 원본 프레임의 머리말 길이를 잰다.
 *
 * `screencap` 은 앞에 width·height·format(+ Android 9 부터 colorSpace)을 붙여 준다 —
 * 판에 따라 12바이트이기도 16바이트이기도 하다. **외워서 쓰지 않는다**: 전체 길이에서
 * 픽셀이 차지하는 만큼을 빼면 머리말 길이가 정확히 나온다. 어긋난 값을 쓰면 화면이
 * 몇 픽셀 밀린 채로 나오는데, 그건 크기도 그대로라 눈으로 보기 전에는 모른다.
 */
async function probeRawFrame(): Promise<DeviceCache['raw']> {
    const c = cache()
    if (c.rawProbed) return c.raw
    c.rawProbed = true
    const r = await adb(['exec-out', 'screencap'], 25_000)
    const buf = r.stdout
    if (buf.length < 32) return (c.raw = null)
    const width = buf.readUInt32LE(0)
    const height = buf.readUInt32LE(4)
    const offset = buf.length - width * height * 4
    c.raw = width > 0 && height > 0 && (offset === 12 || offset === 16) ? { offset, width, height } : null
    console.log(
        c.raw
            ? `[aiqa] ${SERIAL} 원본 프레임 ${width}x${height} 머리말 ${offset}B — 빠른 길로 갑니다`
            : `[aiqa] ${SERIAL} 원본 프레임 머리말을 못 읽었어요 — PNG 길로 갑니다`,
    )
    return c.raw
}

/**
 * 한 장 찍어 JPEG 으로 돌려준다.
 *
 * **왜 PNG 를 그대로 안 보내나.** 720x1600 한 장이 150~300KB 다. 초당 서너 장이면 집
 * 업로드 대역을 이것만으로 1MB/s 씩 먹는다. 폭 `width` 로 줄여 JPEG 으로 바꾸면 20~40KB 다.
 *
 * **왜 screenrecord(h264) 가 아닌가.** 인코더가 한두 초를 물고 있다가 내놓는다. 화면만
 * 볼 때는 그게 더 곱지만, 여기서는 사람이 눌러 보는 자리라 **그 지연이 곧 조작감**이다.
 * 한 장씩 찍으면 늘 방금 화면이다.
 */
export async function screenshotJpeg(width: number, quality: number): Promise<Buffer | null> {
    const raw = await probeRawFrame()
    // adb 와 ffmpeg 를 파이프로 잇는다 — 중간 파일도, 픽셀을 Node 로 들여오는 왕복도 없다
    const pipeline = raw
        ? `${ADB} -s ${SERIAL} exec-out screencap | tail -c +${raw.offset + 1} | ` +
          `ffmpeg -hide_banner -loglevel error -f rawvideo -pixel_format rgba ` +
          `-video_size ${raw.width}x${raw.height} -i pipe:0 ` +
          `-vf scale=${width}:-2 -q:v ${quality} -frames:v 1 -f mjpeg pipe:1`
        : `${ADB} -s ${SERIAL} exec-out screencap -p | ` +
          `ffmpeg -hide_banner -loglevel error -f image2pipe -i pipe:0 ` +
          `-vf scale=${width}:-2 -q:v ${quality} -frames:v 1 -f mjpeg pipe:1`
    const r = await run('/bin/sh', ['-c', pipeline], 15_000)
    if (r.stdout.length === 0) return null
    return r.stdout
}

// ── 조작 ─────────────────────────────────────────────────────────────────────

export async function tap(x: number, y: number) {
    invalidateDump()
    await adb(['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))], 8_000)
}

export async function swipe(x1: number, y1: number, x2: number, y2: number, ms: number) {
    invalidateDump()
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

/** QA 전용 키보드(별도 apk). 한글을 넣는 유일한 길이다 — 아래 typeText 주석 참고 */
const IME_ACTION_TEXT = 'com.example.demo.qaime.TEXT'
const IME_ACTION_CLEAR = 'com.example.demo.qaime.CLEAR'
const IME_ID = process.env.AIQA_IME_ID ?? 'com.example.demo.qaime/.QaKeyboard'

/**
 * 글자 넣기.
 *
 * **`adb shell input text` 는 아스키만 넣는다.** 한글은 KeyCharacterMap 에 없어서 키
 * 이벤트로 바뀌지 못하고 **조용히 사라진다** — 오류도 안 난다. 이걸 모르면 "왜 검색이
 * 빈칸이지"를 한참 들여다보게 된다.
 *
 * 그래서 길이 둘이다:
 *   · 아스키뿐이면 `input text` (왕복 한 번, 제일 빠르다)
 *   · 한 글자라도 아스키 밖이면 **QA 키보드에 방송**을 보낸다. 그 키보드가 붙어 있는
 *     입력칸에 `commitText` 로 그대로 넣는다 (sample-app/ime/)
 *
 * 어느 쪽이든 원문을 셸에 그대로 싣지 않는다. 지나가는 길에 셸이 둘이라(우리 셸·기기 셸)
 * 따옴표·`$`·공백을 그 둘이 먼저 해석한다 — base64 는 `A-Za-z0-9+/=` 뿐이라 안전하다.
 */
export async function typeText(text: string) {
    invalidateDump()
    if (/^[\x20-\x7e]*$/.test(text)) {
        // 공백은 %s 로 바꿔야 `input` 이 한 낱말로 본다
        const escaped = text.replace(/(["'\\$`&|;<>()])/g, '\\$1').replace(/ /g, '%s')
        await adb(['shell', 'input', 'text', escaped], 10_000)
        return
    }
    const b64 = Buffer.from(text, 'utf8').toString('base64')

    // **들어갔는지 확인하고 안 들어갔으면 다시 보낸다.** 방금 누른 입력칸에 키보드가
    // 아직 안 붙었으면(탭과 입력 사이가 수십 ms 다) 글자가 조용히 사라진다 — 실제로
    // 검색 시나리오가 그렇게 빈칸으로 떨어졌다.
    // 신호는 키보드가 세우는 결과 코드다: `am broadcast` 가 "result=1" 로 찍어 준다.
    if (await pushText(b64, 4)) return

    // 그래도 안 들어갔으면 **기본 키보드가 우리 것이 아닐 가능성이 크다.** 앱을 다시
    // 깔면 시스템이 IME 목록을 훑으면서 되돌려 놓는 판이 있고, 그때 붙는 것은 Gboard 다 —
    // Gboard 는 우리 방송을 모른다. 다시 세우고 한 번 더 해 본다.
    await adb(['shell', 'ime', 'enable', IME_ID], 10_000)
    await adb(['shell', 'ime', 'set', IME_ID], 10_000)
    if (await pushText(b64, 4)) return

    // **조용히 넘어가지 않는다.** 여기서 삼키면 두 화면 뒤의 assertVisible 이 "화면에
    // 없어요"로 떨어지고, 진짜 원인(글자가 안 들어갔다)은 아무 데도 안 남는다.
    throw new AdbError('한글을 넣지 못했어요 — QA 키보드가 기본이 아닌 것 같아요', null)
}

/** 방송을 몇 번 보내 보고, 키보드가 세운 결과 코드로 성공을 판정한다 */
async function pushText(b64: string, attempts: number): Promise<boolean> {
    for (let i = 0; i < attempts; i += 1) {
        const r = await adb(['shell', 'am', 'broadcast', '-a', IME_ACTION_TEXT, '--es', 'b64', b64], 12_000)
        if (/result=1\b/.test(r.stdout.toString('utf8'))) return true
        await new Promise((done) => setTimeout(done, 250))
    }
    return false
}

/** 입력칸 비우기. QA 키보드가 붙어 있으면 한 번에, 아니면 지우기 키를 반복한다 */
export async function eraseText(count: number) {
    invalidateDump()
    const r = await adb(['shell', 'am', 'broadcast', '-a', IME_ACTION_CLEAR, '--ei', 'n', String(count)], 10_000)
    // 키보드가 받았으면 그걸로 끝이다. 못 받았을 때만 지우기 키를 반복한다
    if (!/result=1\b/.test(r.stdout.toString('utf8'))) await keyRepeat('del', count)
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
    invalidateDump()
    await adb(['shell', 'input', 'keyevent', code], 8_000)
}

/**
 * 같은 키를 여러 번. `input keyevent` 는 키코드를 여러 개 받아 준다 —
 * 한 번씩 adb 를 부르면 서른 번 지우는 데 왕복이 서른 번이고, 그게 그대로
 * "adb 갈래가 느리다"로 보인다.
 */
export async function keyRepeat(name: string, times: number) {
    invalidateDump()
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
    invalidateDump()
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
 * 마지막으로 읽은 화면. **행동을 하면 그 자리에서 버린다** (아래 invalidateDump).
 *
 * 왜 캐시하나: `uiautomator dump` 는 홈서버 실측 **2.1초**다(--compressed 도 같다 —
 * 창이 조용해지기를 기다리는 시간이라 줄지 않는다). 시나리오에서 assertVisible 이
 * 잇달아 나오는 판이 흔한데, 그 사이에 아무 행동도 없었으면 화면은 같다. 그때 두 번
 * 읽으면 2.1초를 그냥 버리는 것이다.
 *
 * **안전한 이유는 무효화가 행동 쪽에 붙어 있어서다** — tap·swipe·글자·키·앱 재실행이
 * 전부 버린다. 화면을 바꿀 수 있는 자리가 그것뿐이다.
 */
/** 화면을 바꿀 만한 일을 했다. 다음 읽기는 기기에서 새로 가져온다 */
export function invalidateDump() {
    cache().lastDump = null
}

/**
 * 지금 화면의 요소 목록.
 *
 * **adb 갈래의 눈이다** — "이 글자를 누르라"는 지시를 좌표로 바꾸는 유일한 길이고,
 * 실패했을 때 LLM 에 넘기는 근거이기도 하다.
 *
 * `maxAgeMs` 안쪽의 지난 읽기가 있으면 그걸 쓴다. 0(기본)이면 늘 새로 읽는다 —
 * 화면이 바뀌기를 기다리는 자리(waitFor 의 두 번째 시도부터)는 반드시 0이어야 한다.
 *
 * `uiautomator dump /dev/tty` 로 파일을 거치지 않고 바로 받는다. `/sdcard` 에 떨어뜨렸다
 * 다시 당기면 왕복이 둘 늘고, 그만큼 adb 갈래가 느려 보인다 — 견주는 자리라 공정하지 않다.
 *
 * XML 파서를 들이지 않는다. uiautomator 가 내는 것은 속성만 있는 평평한 `<node .../>` 라
 * 정규식으로 충분하고, 이 스택은 의존성이 0이다.
 */
export async function dump(maxAgeMs = 0): Promise<UiNode[]> {
    const c = cache()
    if (maxAgeMs > 0 && c.lastDump && Date.now() - c.lastDump.at <= maxAgeMs) return c.lastDump.nodes
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
    c.lastDump = { nodes, at: Date.now() }
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
