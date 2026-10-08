// 화면 프레임 루프 — 한 대뿐인 에뮬레이터를 여러 브라우저가 같이 본다.
//
// **찍는 것은 한 번이고 보내는 것은 여러 번이다.** 보는 사람마다 screencap 을 돌리면
// 두 명째부터 기기가 못 따라간다(한 장에 200~400ms 다). 그래서 루프는 하나이고,
// 만든 JPEG 한 장을 붙어 있는 연결 전부에 그대로 흘린다.

import { createHash } from 'node:crypto'
import { WsConnection } from './ws.ts'
import * as device from './device.ts'

/** 보내는 화면의 가로 픽셀. 폰 크기가 아니라 **회선**이 정하는 값이다 */
const WIDTH = Number(process.env.AIQA_FRAME_WIDTH ?? 360)
/** JPEG 품질 (ffmpeg -q:v, 낮을수록 좋다). 6~8 이 글씨가 읽히는 하한선이다 */
const QUALITY = Number(process.env.AIQA_FRAME_QUALITY ?? 7)

/**
 * 두 박자로 돈다. **누가 만지고 있으면 빠르게, 보고만 있으면 느리게.**
 * 가만히 있는 화면을 초당 네 번 찍는 것은 기기와 회선을 그냥 태우는 일이다.
 */
const FAST_MS = Number(process.env.AIQA_FRAME_FAST_MS ?? 220)
const SLOW_MS = Number(process.env.AIQA_FRAME_SLOW_MS ?? 900)
/** 마지막 조작 뒤 이만큼은 빠른 박자를 유지한다 — 누른 결과가 화면에 늦게 뜨면 답답하다 */
const FAST_WINDOW_MS = 4_000

/**
 * 밀린 바이트가 이보다 많은 연결에는 이번 판을 건너뛴다. 옛 화면을 쌓아 두는 것은
 * 아무에게도 이롭지 않다 — 회선이 풀리는 순간 지나간 화면이 우수수 지나갈 뿐이다.
 */
const MAX_BACKLOG = 512 * 1024

export type Viewer = {
    id: string
    ws: WsConnection
    /** 프레임을 받고 싶은지. 목록만 보는 탭은 끌 수 있다 */
    wantsFrames: boolean
    /** Remote viewers are permanently bound to the requested device. */
    serial?: string
    onFrame?: (jpeg: Buffer) => boolean
}

const viewers = new Map<string, Viewer>()
let timer: NodeJS.Timeout | null = null
let busy = false
let lastActivity = 0
let lastFrameHash = ''
let lastFrame: Buffer | null = null
let lastFrameSerial = ''

function sendFrame(viewer: Viewer, frame: Buffer, serial: string) {
    if (!viewer.wantsFrames || !viewer.ws.isOpen || viewer.ws.backlog > MAX_BACKLOG) return
    if (serial !== device.target() || (viewer.serial && viewer.serial !== serial)) return
    if (viewer.onFrame && !viewer.onFrame(frame)) return
    viewer.ws.sendBinary(frame)
}

/** 프레임 루프가 마지막으로 본 기기 상태. 화면에 뱃지로 나간다 */
let deviceOnline = false

/**
 * **보는 사람이 없어도 화면을 계속 뜨게 붙잡아 두는 표.**
 *
 * 증적(recorder.ts)이 단계마다 집어 가는 것은 이 루프가 만든 마지막 프레임이다. 그런데
 * 루프는 보는 사람이 없으면 서 있으므로, 브라우저를 아무도 안 열어 둔 채 API 로 시나리오를
 * 돌리면 **증적에 화면이 한 장도 안 남는다** (2026-09-04 에 그렇게 빈 xlsx 를 만들었다).
 * 그래서 녹화·증적이 도는 동안은 여기를 하나 올려 둔다.
 */
let holds = 0

export function add(viewer: Viewer) {
    viewers.set(viewer.id, viewer)
    // 붙자마자 지난 화면 한 장을 던져 준다 — 첫 프레임까지 검은 화면을 보지 않게
    if (lastFrame) sendFrame(viewer, lastFrame, lastFrameSerial)
    ensureLoop()
}

export function remove(id: string) {
    viewers.delete(id)
    if (jpegViewers() === 0 && holds === 0) stopLoop()
}

/**
 * 영상(stream.ts)으로 보는 사람은 JPEG 을 받지 않는다. 그 사람만 붙어 있을 때 루프가
 * 돌면 아무에게도 안 가는 화면을 0.5초에 한 장씩 찍는 셈이다 — 그래서 JPEG 을 받는
 * 사람 수로 루프를 돌리고 세운다.
 */
export function setWantsFrames(id: string, wants: boolean) {
    const v = viewers.get(id)
    if (!v) return
    v.wantsFrames = wants
    if (wants) {
        if (lastFrame) sendFrame(v, lastFrame, lastFrameSerial)
        ensureLoop()
    } else if (jpegViewers() === 0 && holds === 0) stopLoop()
}

function jpegViewers() {
    let n = 0
    for (const v of viewers.values()) if (v.wantsFrames) n += 1
    return n
}

export function hasJpegViewers() {
    return jpegViewers() > 0
}

/** 영상 길이 기기 상태를 알려 준다 — JPEG 루프가 서 있는 동안은 여기가 유일한 눈이다 */
export function noteDevice(online: boolean) {
    if (deviceOnline === online) return
    deviceOnline = online
    broadcast({ type: 'device', online })
}

/** 보는 사람이 없어도 프레임을 계속 만든다 (증적·녹화가 도는 동안) */
export function hold() {
    holds += 1
    ensureLoop()
}

export function release() {
    holds = Math.max(0, holds - 1)
    if (holds === 0 && jpegViewers() === 0) stopLoop()
}

export function count() {
    return viewers.size
}

export function isDeviceOnline() {
    return deviceOnline
}

/**
 * 마지막으로 보낸 화면 한 장.
 *
 * 증적이 이걸 집어 간다 — **새로 찍지 않으려고 있는 함수다.** 단계마다 screencap 을
 * 새로 부르면 단계당 150ms 가 붙어서 세 갈래의 시간 비교가 통째로 거짓이 된다.
 */
export function lastJpeg(): Buffer | null {
    return lastFrame
}

/**
 * 보는 기기가 바뀌었다. **지난 프레임을 버린다** — 안 버리면 새 기기의 첫 장이 옛 기기의
 * 장과 우연히 같은 해시일 때 화면이 안 바뀌고, 무엇보다 붙는 사람에게 옛 기기 화면을
 * 한 장 보여 주게 된다.
 */
export function retarget() {
    lastFrame = null
    lastFrameSerial = ''
    lastFrameHash = ''
    kick(0)
}

/** 누가 방금 만졌다. 다음 몇 초는 빠른 박자로 돈다 */
export function poke() {
    lastActivity = Date.now()
}

/**
 * 방금 화면이 바뀌었을 것이다 — **다음 박자를 기다리지 말고 지금 찍는다.**
 *
 * 이게 없으면 누른 결과가 최대 한 박자(220ms) 늦게 보인다. 실측으로 행동에서 화면
 * 갱신까지 중앙값 895ms 였는데, 그 중 눈에 띄는 몫이 이 기다림이었다.
 *
 * `settleMs` 만큼 두는 이유: 누르자마자 찍으면 아직 안 바뀐 화면을 찍어 놓고, 프레임
 * 해시가 같아서 **그 뒤로 한 박자를 더 기다린다.** 애니메이션을 꺼 둔 기기라 이 정도면
 * 다시 그려져 있다.
 */
export function kick(settleMs = 120) {
    lastActivity = Date.now()
    setTimeout(() => {
        sinceLastShot = SLOW_MS // 어느 박자든 이번 판은 무조건 찍는다
        void tick()
    }, settleMs)
}

/** 화면 말고 상태·로그를 뿌릴 때 — 붙어 있는 전부에게 같은 JSON 을 보낸다 */
export function broadcast(message: unknown) {
    const text = JSON.stringify(message)
    for (const v of viewers.values()) {
        if (v.ws.isOpen) v.ws.send(text)
    }
}

/** 한 사람에게만 */
export function sendTo(id: string, message: unknown) {
    const v = viewers.get(id)
    if (v?.ws.isOpen) v.ws.send(JSON.stringify(message))
}

function ensureLoop() {
    if (timer) return
    timer = setInterval(tick, FAST_MS)
    // 붙자마자 한 장
    void tick()
}

function stopLoop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
}

let sinceLastShot = 0

async function tick() {
    if (busy) return
    if (jpegViewers() === 0 && holds === 0) return

    // 느린 박자일 때는 몇 판을 그냥 넘긴다. setInterval 을 갈아끼우는 것보다 셈이 단순하다.
    // **붙잡혀 있는 동안은 늘 빠른 쪽이다** — 증적이 집어 가는 화면이 900ms 묵은 것이면
    // 단계와 그림이 어긋나서 증적으로 쓸 수가 없다
    const fast = holds > 0 || Date.now() - lastActivity < FAST_WINDOW_MS
    const period = fast ? FAST_MS : SLOW_MS
    sinceLastShot += FAST_MS
    if (sinceLastShot < period) return
    sinceLastShot = 0

    busy = true
    try {
        const serial = device.target()
        const orientationAware = [...viewers.values()].some((viewer) => viewer.serial === serial)
        const jpeg = await device.screenshotJpeg(WIDTH, QUALITY, orientationAware)
        if (serial !== device.target()) return
        // 100바이트짜리 "JPEG" 은 ffmpeg 가 반쯤 실패한 것이다. 화면에 깨진 조각을 보내지 않는다
        if (!jpeg || jpeg.length < 512) {
            if (deviceOnline) {
                deviceOnline = false
                broadcast({ type: 'device', online: false })
            }
            return
        }
        if (!deviceOnline) {
            deviceOnline = true
            broadcast({ type: 'device', online: true })
        }

        // 같은 화면이면 보내지 않는다. 가만히 있는 폰이 회선을 먹지 않게 하는 값싼 방법이다.
        // (JPEG 은 같은 입력이면 같은 바이트가 나온다 — 인코더가 결정적이다)
        //
        // 길이만으로 견주지 않는다. JPEG 끝은 늘 FF D9 라 뒤 몇 바이트도 사실상 상수이고,
        // 그러면 크기가 우연히 같은 다른 화면이 통째로 안 나간다. 20KB 해시가 훨씬 싸다.
        const hash = createHash('md5').update(jpeg).digest('base64')
        if (hash === lastFrameHash && lastFrameSerial === serial) return
        lastFrameHash = hash
        lastFrame = jpeg
        lastFrameSerial = serial

        for (const v of viewers.values()) {
            sendFrame(v, jpeg, serial)
        }
    } finally {
        busy = false
    }
}
