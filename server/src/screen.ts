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
}

const viewers = new Map<string, Viewer>()
let timer: NodeJS.Timeout | null = null
let busy = false
let lastActivity = 0
let lastFrameHash = ''
let lastFrame: Buffer | null = null

/** 프레임 루프가 마지막으로 본 기기 상태. 화면에 뱃지로 나간다 */
let deviceOnline = false

export function add(viewer: Viewer) {
    viewers.set(viewer.id, viewer)
    // 붙자마자 지난 화면 한 장을 던져 준다 — 첫 프레임까지 검은 화면을 보지 않게
    if (lastFrame && viewer.wantsFrames) viewer.ws.sendBinary(lastFrame)
    ensureLoop()
}

export function remove(id: string) {
    viewers.delete(id)
    if (viewers.size === 0) stopLoop()
}

export function count() {
    return viewers.size
}

export function isDeviceOnline() {
    return deviceOnline
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
    if (viewers.size === 0) return

    // 느린 박자일 때는 몇 판을 그냥 넘긴다. setInterval 을 갈아끼우는 것보다 셈이 단순하다
    const fast = Date.now() - lastActivity < FAST_WINDOW_MS
    const period = fast ? FAST_MS : SLOW_MS
    sinceLastShot += FAST_MS
    if (sinceLastShot < period) return
    sinceLastShot = 0

    busy = true
    try {
        const jpeg = await device.screenshotJpeg(WIDTH, QUALITY)
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
        if (hash === lastFrameHash) return
        lastFrameHash = hash
        lastFrame = jpeg

        for (const v of viewers.values()) {
            if (!v.wantsFrames || !v.ws.isOpen) continue
            if (v.ws.backlog > MAX_BACKLOG) continue
            v.ws.sendBinary(jpeg)
        }
    } finally {
        busy = false
    }
}
