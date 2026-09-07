// 화면을 **영상으로** 보낸다 — scrcpy 서버(H.264)를 기기 안에 띄우고 그 스트림을 브라우저로 흘린다.
//
// JPEG 루프(screen.ts)는 한 장에 0.5초가 든다(`screencap` 4.6MB 를 adb 로 끌어와 ffmpeg 로
// 줄인다). 누른 결과가 화면에 뜨기까지 그 값이 그대로 지연이었다 — 실측 중앙값 895ms.
// 이 모듈은 그 자리를 **기기 안 인코더**로 바꾼다: scrcpy 서버가 MediaCodec 으로 H.264 를
// 만들어 소켓으로 내주면(프레임당 수십 ms), 우리는 그 패킷을 붙어 있는 브라우저 전부에
// 그대로 흘리고, 브라우저는 WebCodecs 로 푼다. 2026-09-07 사용자 지시 "딜레이 거의 없게".
//
// **터치도 같은 길로 들어간다.** `adb shell input tap` 은 매번 자바 프로세스를 하나 띄워서
// 150~300ms 다. scrcpy 의 제어 소켓은 InputManager 에 바로 넣는다 — 10ms 안쪽이다.
// 한글 입력만은 예외로 QA 키보드 방송(device.typeText)을 그대로 쓴다 — scrcpy 의 글자
// 주입은 ASCII 만 믿을 수 있다.
//
// JPEG 길은 없애지 않는다. WebCodecs 가 없는 브라우저의 대체 길이고, 증적(recorder)이
// 단계마다 집어 가는 화면이 그 루프의 마지막 장이라서다.
//
// 프로토콜은 scrcpy v4.1 의 것이다 (server/src/main/java/com/genymobile/scrcpy/…):
//   · 첫 인자가 버전이고 **서버 jar 의 버전과 글자 그대로 같아야** 뜬다
//   · tunnel_forward=true 면 기기가 localabstract:scrcpy 로 듣고, 우리가 두 번 붙는다 —
//     영상 소켓 먼저, 제어 소켓 다음. 첫 소켓에만 더미 1바이트가 온다
//   · 영상: [코덱 id 4B] 다음부터 패킷. 패킷 머리말 12B 는 두 가지다 — 첫 바이트의 최상위
//     비트가 1 이면 세션 메타(플래그 4B · 폭 4B · 높이 4B, 본문 없음), 아니면
//     [pts·플래그 8B][길이 4B][본문]. 플래그: bit62 = 설정(SPS/PPS) · bit61 = 키프레임
//   · 제어: INJECT_TOUCH_EVENT(2) 32B · INJECT_KEYCODE(0) 14B · INJECT_TEXT(1) 5B+본문.
//     터치의 화면 크기는 **영상 크기와 같아야** 받아 준다 (PositionMapper.map)

import net from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import * as device from './device.ts'
import * as screen from './screen.ts'
import { WsConnection } from './ws.ts'

const JAR = process.env.AIQA_SCRCPY_JAR ?? '/opt/aiqa/scrcpy-server.jar'
const VERSION = process.env.AIQA_SCRCPY_VERSION ?? '4.1'
const PORT = Number(process.env.AIQA_SCRCPY_PORT ?? 27183)
/** 긴 변의 상한. 에뮬레이터(720x1600)는 그대로 가고, 실기기(1080x2400)만 줄어든다 */
const MAX_SIZE = Number(process.env.AIQA_STREAM_MAX_SIZE ?? 1600)
const MAX_FPS = Number(process.env.AIQA_STREAM_MAX_FPS ?? 24)
const BIT_RATE = Number(process.env.AIQA_STREAM_BIT_RATE ?? 2_500_000)
/**
 * MediaCodec 에 그대로 넘기는 인코더 옵션 (scrcpy `video_codec_options`, `키:타입=값,…`).
 * 기본은 **지연 0 프레임 · 실시간 우선** — 소프트웨어 인코더는 그냥 두면 프레임을 몇 장
 * 물고 있다가 내놓는다. 바꿔 볼 값은 compose 의 AIQA_STREAM_CODEC_OPTIONS
 */
const CODEC_OPTIONS = process.env.AIQA_STREAM_CODEC_OPTIONS ?? 'latency:int=0,priority:int=0'
const ADB = process.env.AIQA_ADB ?? 'adb'
/** 보는 사람이 없어진 뒤 이만큼 지나면 인코더를 내린다 — 아무도 안 보는 영상을 만드는 CPU */
const IDLE_STOP_MS = 20_000
/** 밀린 바이트가 이보다 많은 연결에는 델타 프레임을 건너뛴다(키프레임은 보낸다) */
const MAX_BACKLOG = 768 * 1024

/** 브라우저로 나가는 조각. 첫 바이트 'H' 다음이 플래그다 — JPEG(FF D8)과 갈린다 */
const TAG = 0x48
const F_CONFIG = 1
const F_KEY = 2
const F_SESSION = 4

type Packet = { flags: number; data: Buffer }

const viewers = new Map<string, WsConnection>()
let child: ChildProcess | null = null
let video: net.Socket | null = null
let control: net.Socket | null = null
/** 영상 크기 — 세션 메타에서 온다. 터치 좌표는 이 크기로 보낸다 */
let size: { width: number; height: number } | null = null
let config: Buffer | null = null
/** 마지막 키프레임부터 지금까지. 새로 붙는 브라우저가 이걸 받아 바로 그린다 */
let gop: Packet[] = []
let starting = false
let generation = 0
let restartTimer: NodeJS.Timeout | null = null
let idleTimer: NodeJS.Timeout | null = null

function log(line: string) {
    console.log(`[stream] ${line}`)
}

/** AIQA_STREAM_DEBUG=1 이면 주입·패킷 시각을 찍는다 — 지연이 어디서 나는지 가를 때만 */
const DEBUG = process.env.AIQA_STREAM_DEBUG === '1'
const T0 = Date.now()
function trace(line: string) {
    if (DEBUG) console.log(`[stream] t=${Date.now() - T0} ${line}`)
}

// ── 보는 사람 ─────────────────────────────────────────────────────────────

export function addViewer(id: string, ws: WsConnection) {
    viewers.set(id, ws)
    if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
    }
    // 이미 도는 중이면 지금 장면부터 — 세션 메타·설정·현재 GOP 를 차례로 준다
    if (size) ws.sendBinary(frame(F_SESSION, sizeBuffer(size)))
    if (config) ws.sendBinary(frame(F_CONFIG, config))
    for (const p of gop) ws.sendBinary(frame(p.flags, p.data))
    void ensure()
}

export function removeViewer(id: string) {
    viewers.delete(id)
    if (viewers.size === 0 && !idleTimer) {
        idleTimer = setTimeout(() => {
            idleTimer = null
            if (viewers.size === 0) stop()
        }, IDLE_STOP_MS)
    }
}

export function count() {
    return viewers.size
}

/** 제어 소켓이 살아 있어 터치를 이 길로 넣을 수 있나 */
export function ready() {
    return control !== null && !control.destroyed && size !== null
}

export function videoSize() {
    return size
}

/** 보는 기기가 바뀌었다. 지금 것을 내리고 새 기기로 다시 띄운다 */
export function retarget() {
    stop()
    if (viewers.size > 0) void ensure()
}

// ── 띄우기·내리기 ─────────────────────────────────────────────────────────

async function ensure() {
    if (video || starting || viewers.size === 0) return
    starting = true
    const gen = ++generation
    const serial = device.target()
    try {
        await device.adb(['push', JAR, '/data/local/tmp/scrcpy-server.jar'], 20_000)
        await device.adb(['forward', `tcp:${PORT}`, 'localabstract:scrcpy'], 10_000)

        const args = [
            `CLASSPATH=/data/local/tmp/scrcpy-server.jar`,
            'app_process',
            '/',
            'com.genymobile.scrcpy.Server',
            VERSION,
            'tunnel_forward=true',
            'video=true',
            'audio=false',
            'control=true',
            'cleanup=false',
            'send_device_meta=false',
            'send_frame_meta=true',
            'send_dummy_byte=true',
            'send_stream_meta=true',
            'log_level=warn',
            'video_codec=h264',
            `max_size=${MAX_SIZE}`,
            `max_fps=${MAX_FPS}`,
            `video_bit_rate=${BIT_RATE}`,
            ...(CODEC_OPTIONS ? [`video_codec_options=${CODEC_OPTIONS}`] : []),
        ]
        const proc = spawn(ADB, ['-s', serial, 'shell', args.join(' ')], { stdio: ['ignore', 'pipe', 'pipe'] })
        child = proc
        for (const s of [proc.stdout, proc.stderr]) {
            s?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf8').trim()
                if (text) log(`server: ${text.slice(0, 300)}`)
            })
        }
        proc.on('exit', (code) => {
            if (gen !== generation) return
            log(`server exited (${code})`)
            teardown()
            scheduleRestart()
        })

        // 서버가 듣기 시작할 때까지 잠깐 걸린다. forward 는 붙었다고 말하고 바로 끊기므로
        // **더미 바이트가 오는지**로 판정한다. 그 첫 조각에 더미 뒤 바이트(코덱 id·세션
        // 메타)가 같이 실려 올 수 있어 나머지를 파서에 넘긴다
        const first = await connectWithFirstByte(gen)
        if (gen !== generation) {
            first.socket.destroy()
            return
        }
        video = first.socket
        control = await connect()
        control.on('data', () => {}) // 클립보드 같은 답이 온다. 쓰지 않는다
        control.on('error', () => {})
        control.on('close', () => {
            if (gen === generation) control = null
        })

        attachParser(first.socket, gen, first.rest)
        log(`up (${serial}, gen ${gen})`)
    } catch (e) {
        log(`start failed: ${String(e).slice(0, 200)}`)
        teardown()
        scheduleRestart()
    } finally {
        starting = false
    }
}

function scheduleRestart() {
    if (restartTimer || viewers.size === 0) return
    restartTimer = setTimeout(() => {
        restartTimer = null
        void ensure()
    }, 2_000)
}

function stop() {
    generation += 1
    teardown()
}

function teardown() {
    video?.destroy()
    control?.destroy()
    video = null
    control = null
    size = null
    config = null
    gop = []
    if (child) {
        child.kill('SIGTERM')
        child = null
    }
}

function connect(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const s = net.connect({ host: '127.0.0.1', port: PORT })
        s.setNoDelay(true)
        s.once('connect', () => resolve(s))
        s.once('error', reject)
    })
}

/** 붙어서 첫 바이트(더미)까지 받아야 진짜다. 스물다섯 번까지 200ms 마다 다시 붙는다 */
async function connectWithFirstByte(gen: number): Promise<{ socket: net.Socket; rest: Buffer }> {
    for (let i = 0; i < 25; i += 1) {
        if (gen !== generation) throw new Error('superseded')
        try {
            const s = await connect()
            const first = await new Promise<Buffer | null>((resolve) => {
                const timer = setTimeout(() => resolve(null), 1_500)
                s.once('data', (chunk: Buffer) => {
                    clearTimeout(timer)
                    resolve(chunk)
                })
                s.once('close', () => {
                    clearTimeout(timer)
                    resolve(null)
                })
                s.once('error', () => {
                    clearTimeout(timer)
                    resolve(null)
                })
            })
            if (first && first.length >= 1) return { socket: s, rest: first.subarray(1) }
            s.destroy()
        } catch {
            // 아직 안 듣는다
        }
        await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('scrcpy server did not answer')
}

// ── 영상 패킷 풀기 ─────────────────────────────────────────────────────────

function attachParser(sock: net.Socket, gen: number, rest: Buffer) {
    // 더미 바이트는 connectWithFirstByte 가 이미 먹었다. 여기부터 코덱 id 4B, 그 뒤 패킷
    let buf = Buffer.alloc(0)
    let sawCodec = false

    const feed = (chunk: Buffer) => {
        if (gen !== generation) return
        buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk])
        for (;;) {
            if (!sawCodec) {
                if (buf.length < 4) return
                buf = buf.subarray(4)
                sawCodec = true
                continue
            }
            if (buf.length < 12) return
            if (buf[0] & 0x80) {
                // 세션 메타 — 영상 크기가 정해졌다(바뀌었다). 이 뒤로 새 설정·키프레임이 온다
                size = { width: buf.readInt32BE(4), height: buf.readInt32BE(8) }
                buf = buf.subarray(12)
                gop = []
                config = null
                broadcast(F_SESSION, sizeBuffer(size), true)
                log(`session ${size.width}x${size.height}`)
                continue
            }
            const hi = buf.readUInt32BE(0)
            const isConfig = (hi & 0x40000000) !== 0
            const isKey = (hi & 0x20000000) !== 0
            const len = buf.readUInt32BE(8)
            if (buf.length < 12 + len) return
            const data = Buffer.from(buf.subarray(12, 12 + len))
            buf = buf.subarray(12 + len)

            if (data.length > 1500) trace(`pkt ${isConfig ? 'config' : isKey ? 'key' : 'delta'} ${data.length}B`)
            if (isConfig) {
                config = data
                broadcast(F_CONFIG, data, true)
            } else {
                const flags = isKey ? F_KEY : 0
                if (isKey) gop = [{ flags, data }]
                else {
                    gop.push({ flags, data })
                    // 키프레임이 오래 안 오면(가만한 화면) 무한히 쌓인다. 앞을 버린다 —
                    // 그러면 새로 붙는 사람은 다음 키프레임까지 잠깐 검다
                    if (gop.length > 720) gop = []
                }
                broadcast(flags, data, isKey)
            }
            screen.noteDevice(true)
        }
    }
    if (rest.length > 0) feed(Buffer.from(rest))
    sock.on('data', feed)
    sock.on('error', (e) => log(`video socket error: ${String(e).slice(0, 120)}`))
    sock.on('close', () => {
        if (gen !== generation) return
        log('video socket closed')
        teardown()
        scheduleRestart()
    })
}

function frame(flags: number, data: Buffer) {
    return Buffer.concat([Buffer.from([TAG, flags]), data])
}

function sizeBuffer(s: { width: number; height: number }) {
    const b = Buffer.alloc(8)
    b.writeInt32BE(s.width, 0)
    b.writeInt32BE(s.height, 4)
    return b
}

function broadcast(flags: number, data: Buffer, important: boolean) {
    const out = frame(flags, data)
    for (const [id, ws] of viewers) {
        if (!ws.isOpen) {
            viewers.delete(id)
            continue
        }
        // 회선이 밀린 사람에게 델타를 더 쌓아 봐야 늦은 그림만 길어진다. 키프레임·설정은 보낸다
        if (!important && ws.backlog > MAX_BACKLOG) continue
        ws.sendBinary(out)
    }
}

// ── 제어 — 터치·키·글자를 InputManager 로 바로 ──────────────────────────────

const ACTION_DOWN = 0
const ACTION_UP = 1
const ACTION_MOVE = 2
/** scrcpy 의 POINTER_ID_GENERIC_FINGER. 마우스(-1)로 보내면 버튼 상태를 따로 챙겨야 한다 */
const FINGER = -2n

function send(buf: Buffer): boolean {
    if (!control || control.destroyed) return false
    control.write(buf)
    trace(`inject type=${buf[0]} action=${buf[1]}`)
    return true
}

/** 기기 픽셀 → 영상 픽셀. 실기기는 영상이 줄어들어 있을 수 있다 */
function toVideo(x: number, y: number, dev: { width: number; height: number }) {
    const s = size!
    return {
        x: Math.round((x * s.width) / Math.max(1, dev.width)),
        y: Math.round((y * s.height) / Math.max(1, dev.height)),
    }
}

function touchMessage(action: number, x: number, y: number): Buffer {
    const s = size!
    const b = Buffer.alloc(32)
    b.writeUInt8(2, 0) // INJECT_TOUCH_EVENT
    b.writeUInt8(action, 1)
    b.writeBigInt64BE(FINGER, 2)
    b.writeInt32BE(Math.max(0, Math.min(s.width - 1, x)), 10)
    b.writeInt32BE(Math.max(0, Math.min(s.height - 1, y)), 14)
    b.writeUInt16BE(s.width, 18)
    b.writeUInt16BE(s.height, 20)
    b.writeUInt16BE(action === ACTION_UP ? 0 : 0xffff, 22) // 압력, u16 고정소수점
    b.writeInt32BE(0, 24) // actionButton
    b.writeInt32BE(0, 28) // buttons
    return b
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function tap(x: number, y: number, dev: { width: number; height: number }) {
    if (!ready()) return false
    const p = toVideo(x, y, dev)
    device.invalidateDump()
    send(touchMessage(ACTION_DOWN, p.x, p.y))
    await sleep(40)
    send(touchMessage(ACTION_UP, p.x, p.y))
    return true
}

export async function longPress(x: number, y: number, dev: { width: number; height: number }, ms = 650) {
    if (!ready()) return false
    const p = toVideo(x, y, dev)
    device.invalidateDump()
    send(touchMessage(ACTION_DOWN, p.x, p.y))
    await sleep(ms)
    send(touchMessage(ACTION_UP, p.x, p.y))
    return true
}

export async function swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ms: number,
    dev: { width: number; height: number },
) {
    if (!ready()) return false
    const a = toVideo(x1, y1, dev)
    const b = toVideo(x2, y2, dev)
    device.invalidateDump()
    send(touchMessage(ACTION_DOWN, a.x, a.y))
    // 16ms 마다 한 점 — 손가락이 움직이는 것처럼. 점이 너무 적으면 튕기기(fling)로 읽힌다
    const steps = Math.max(4, Math.min(60, Math.round(ms / 16)))
    for (let i = 1; i <= steps; i += 1) {
        await sleep(ms / steps)
        const t = i / steps
        send(touchMessage(ACTION_MOVE, Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t)))
    }
    send(touchMessage(ACTION_UP, b.x, b.y))
    return true
}

/** 안드로이드 키코드. 화면 아래 단추 셋과 엔터·지우기가 여기로 온다 */
const KEYCODES: Record<string, number> = {
    home: 3,
    back: 4,
    recent: 187,
    enter: 66,
    del: 67,
    tab: 61,
    volume_up: 24,
    volume_down: 25,
    power: 26,
}

export async function key(name: string) {
    const code = KEYCODES[name]
    if (code == null || !ready()) return false
    device.invalidateDump()
    for (const action of [ACTION_DOWN, ACTION_UP]) {
        const b = Buffer.alloc(14)
        b.writeUInt8(0, 0) // INJECT_KEYCODE
        b.writeUInt8(action, 1)
        b.writeInt32BE(code, 2)
        b.writeInt32BE(0, 6) // repeat
        b.writeInt32BE(0, 10) // metaState
        send(b)
        await sleep(10)
    }
    return true
}

/** ASCII 만. 한글은 부르는 쪽이 QA 키보드 길로 보낸다 */
export function text(value: string): boolean {
    if (!ready() || !/^[\x20-\x7e]+$/.test(value)) return false
    device.invalidateDump()
    const body = Buffer.from(value, 'utf8')
    const b = Buffer.alloc(5 + body.length)
    b.writeUInt8(1, 0) // INJECT_TEXT
    b.writeInt32BE(body.length, 1)
    body.copy(b, 5)
    return send(b)
}
