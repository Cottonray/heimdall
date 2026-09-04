// AI QA 데모 서버 — 홈서버(`qa.example/aiqa`)에서 돈다.
//
// **의존성이 없다.** WebSocket 은 ws.ts 에 직접 짰고(RFC 6455 의 우리가 쓰는 부분만),
// 바깥 호출은 Node 내장 fetch 하나다. AICC 와 같은 판단이다 — node_modules 가 없으면
// 이미지가 얇고 배포가 파일 복사에 가까워진다.
//
// 실행:  node --experimental-strip-types src/main.ts
//
// 화면과의 통신은 **WebSocket 한 줄**이다. AICC 는 SSE + POST 로 나눴지만 여기는
// 프레임이 바이너리로 계속 내려가고 손가락질이 같은 줄로 올라온다 — 나누면 왕복이
// 하나 더 붙고, 그 지연이 조작감에 그대로 나온다.

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import * as device from './device.ts'
import * as screen from './screen.ts'
import * as control from './control.ts'
import * as flows from './flows.ts'
import * as runner from './runner.ts'
import * as llm from './llm.ts'
import { accept } from './ws.ts'

const BASE = process.env.AIQA_BASE_PATH ?? '/aiqa'
const PORT = Number(process.env.AIQA_PORT ?? 8080)
const WEB_DIR = process.env.AIQA_WEB_DIR ?? path.join(import.meta.dirname, '..', '..', 'web')

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    })
    res.end(JSON.stringify(body))
}

async function readBody(req: http.IncomingMessage, limit = 256 * 1024): Promise<string> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
        size += (chunk as Buffer).length
        if (size > limit) throw new Error('body too large')
        chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
}

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
}

async function serveStatic(res: http.ServerResponse, rel: string) {
    // `..` 로 컨테이너 파일시스템을 훑지 못하게 한다. 내주는 것은 web/ 안뿐이다
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '')
    const file = path.join(WEB_DIR, safe === '' || safe === '/' ? 'index.html' : safe)
    if (!file.startsWith(WEB_DIR)) {
        json(res, 403, { error: 'forbidden' })
        return
    }
    try {
        const body = await readFile(file)
        res.writeHead(200, {
            'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
            'cache-control': 'no-cache',
        })
        res.end(body)
    } catch {
        json(res, 404, { error: 'not found' })
    }
}

// ── 화면이 보내오는 것 ────────────────────────────────────────────────────────

type Incoming =
    | { t: 'hello'; frames?: boolean }
    | { t: 'claim' }
    | { t: 'release' }
    | { t: 'tap'; x: number; y: number }
    | { t: 'longpress'; x: number; y: number }
    | { t: 'swipe'; x1: number; y1: number; x2: number; y2: number; ms?: number }
    | { t: 'text'; value: string }
    | { t: 'key'; name: string }

/** 화면이 보내온 갈래 이름. 모르는 값은 maestro 로 본다 — 기본은 늘 진짜 도구 쪽이다 */
function engineOf(value: unknown): runner.Engine {
    return value === 'adb' ? 'adb' : 'maestro'
}

/** 0~1 로 온 좌표를 기기 픽셀로 되돌린다. 브라우저 쪽 확대·축소를 서버가 알 필요가 없다 */
function toPixels(nx: number, ny: number, size: { width: number; height: number }) {
    const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
    return { x: clamp(nx) * size.width, y: clamp(ny) * size.height }
}

async function handleInput(viewerId: string, msg: Incoming) {
    if (runner.busy() || control.runnerBusy()) return
    if (!control.mayTouch(viewerId)) return
    screen.poke()
    const size = await device.screenSize()

    switch (msg.t) {
        case 'tap': {
            const p = toPixels(msg.x, msg.y, size)
            await device.tap(p.x, p.y)
            break
        }
        case 'longpress': {
            const p = toPixels(msg.x, msg.y, size)
            await device.longPress(p.x, p.y)
            break
        }
        case 'swipe': {
            const a = toPixels(msg.x1, msg.y1, size)
            const b = toPixels(msg.x2, msg.y2, size)
            const ms = Math.min(2000, Math.max(60, Number(msg.ms ?? 200)))
            await device.swipe(a.x, a.y, b.x, b.y, ms)
            break
        }
        case 'text': {
            const value = String(msg.value ?? '')
            // 한 번에 밀어 넣는 양을 묶어 둔다. 긴 문자열은 기기 셸에서 잘리기도 한다
            if (value.length > 0 && value.length <= 200) await device.typeText(value)
            break
        }
        case 'key':
            await device.key(String(msg.name ?? ''))
            break
    }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let route = url.pathname

    // 컨테이너 헬스체크는 접두사 없이 들어온다
    if (route === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('ok\n')
        return
    }

    // nginx 는 접두사를 떼지 않는다. 여기서 한 번만 벗겨 아래 판정을 단순하게 둔다
    if (route === BASE) {
        res.writeHead(302, { location: `${BASE}/` })
        res.end()
        return
    }
    if (route.startsWith(`${BASE}/`)) route = route.slice(BASE.length)
    else if (route !== '/') {
        json(res, 404, { error: 'not found' })
        return
    }

    try {
        if (req.method === 'GET' && route === '/api/config') {
            const [state, list] = await Promise.all([device.state(), flows.list()])
            json(res, 200, {
                appId: device.APP_ID,
                device: state,
                control: control.snapshot(),
                running: runner.busy(),
                viewers: screen.count(),
                llm: llm.enabled(),
                timings: runner.timings(),
                flows: list.map((f) => ({ id: f.id, name: f.name, desc: f.desc, yaml: f.yaml })),
            })
            return
        }

        if (req.method === 'POST' && route === '/api/run') {
            const body = JSON.parse((await readBody(req)) || '{}') as { flowId?: string; engine?: string }
            const r = await runner.run(String(body.flowId ?? ''), engineOf(body.engine))
            json(res, r.ok ? 200 : 409, r)
            return
        }

        // 같은 시나리오를 두 갈래로 잇달아 돌려 시간을 견준다
        if (req.method === 'POST' && route === '/api/compare') {
            const body = JSON.parse((await readBody(req)) || '{}') as { flowId?: string }
            const r = await runner.compare(String(body.flowId ?? ''))
            json(res, r.ok ? 200 : 409, r)
            return
        }

        if (req.method === 'GET' && route === '/api/timings') {
            json(res, 200, { timings: runner.timings() })
            return
        }

        if (req.method === 'POST' && route === '/api/run-adhoc') {
            const body = JSON.parse((await readBody(req)) || '{}') as {
                name?: string
                yaml?: string
                engine?: string
            }
            const yaml = String(body.yaml ?? '')
            if (!yaml.includes('appId:')) {
                json(res, 400, { ok: false, error: 'appId 줄이 없는 시나리오예요' })
                return
            }
            const r = await runner.runAdhoc(String(body.name ?? '즉석 시나리오'), yaml, engineOf(body.engine))
            json(res, r.ok ? 200 : 409, r)
            return
        }

        if (req.method === 'POST' && route === '/api/stop') {
            json(res, 200, { ok: runner.cancel() })
            return
        }

        if (req.method === 'POST' && route === '/api/app/restart') {
            if (runner.busy()) {
                json(res, 409, { ok: false, error: '시나리오가 도는 중이에요' })
                return
            }
            screen.poke()
            await device.relaunchApp()
            json(res, 200, { ok: true })
            return
        }

        if (req.method === 'POST' && route === '/api/ai/flow') {
            const body = JSON.parse((await readBody(req)) || '{}') as { instruction?: string }
            const instruction = String(body.instruction ?? '').slice(0, 500)
            if (!instruction.trim()) {
                json(res, 400, { ok: false, error: '무엇을 시킬지 적어주세요' })
                return
            }
            if (!llm.enabled()) {
                json(res, 503, { ok: false, error: 'OpenRouter 키가 없어 이 기능만 꺼져 있어요' })
                return
            }
            // **지금 화면에 실제로 있는 글자**를 같이 넘긴다. 앱을 통째로 설명하는 것보다
            // 이게 정확하고, 앱이 바뀌어도 프롬프트를 고칠 일이 없다
            const words = await device.visibleTexts(60)
            const yaml = await llm.toFlow(instruction, words)
            json(res, 200, { ok: true, yaml })
            return
        }

        if (req.method === 'POST' && route === '/api/ai/diagnose') {
            if (!llm.enabled()) {
                json(res, 503, { ok: false, error: 'OpenRouter 키가 없어 이 기능만 꺼져 있어요' })
                return
            }
            const e = await runner.evidence()
            if (!e) {
                json(res, 400, { ok: false, error: '아직 돌린 시나리오가 없어요' })
                return
            }
            const text = await llm.diagnose(e)
            json(res, 200, { ok: true, text })
            return
        }

        if (req.method === 'GET') {
            await serveStatic(res, route)
            return
        }
        json(res, 404, { error: 'not found' })
    } catch (e) {
        json(res, 500, { error: String(e).slice(0, 300) })
    }
})

// ── WebSocket ────────────────────────────────────────────────────────────────

server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== `${BASE}/ws` && url.pathname !== '/ws') {
        socket.destroy()
        return
    }
    const ws = accept(req, socket)
    if (!ws) return

    const viewerId = randomUUID()
    screen.add({ id: viewerId, ws, wantsFrames: true })

    void (async () => {
        const size = await device.screenSize()
        ws.send(
            JSON.stringify({
                type: 'hello',
                viewerId,
                size,
                control: control.snapshot(),
                deviceOnline: screen.isDeviceOnline(),
                running: runner.busy(),
                viewers: screen.count(),
            }),
        )
        screen.broadcast({ type: 'viewers', viewers: screen.count() })
    })()

    ws.on({
        onMessage: (text) => {
            let msg: Incoming
            try {
                msg = JSON.parse(text) as Incoming
            } catch {
                return
            }
            switch (msg.t) {
                case 'claim': {
                    const r = control.claim(viewerId)
                    if (!r.ok) screen.sendTo(viewerId, { type: 'claim-denied', reason: r.reason })
                    return
                }
                case 'release':
                    control.release(viewerId)
                    return
                case 'hello':
                    return
                default:
                    void handleInput(viewerId, msg)
            }
        },
        onClose: () => {
            control.forget(viewerId)
            screen.remove(viewerId)
            screen.broadcast({ type: 'viewers', viewers: screen.count() })
        },
    })
})

// 두 갈래가 내는 것은 전부 그대로 화면으로 흘린다. 로그가 곧 데모다
runner.onEvent((e) => {
    if (e.type === 'run-start') control.lockForRunner(`${e.name} · ${e.engine}`)
    if (e.type === 'run-end') control.unlockRunner()
    screen.broadcast(e)
    // 시나리오가 도는 동안은 화면이 빠르게 바뀐다. 프레임 박자를 그동안 올려 둔다
    screen.poke()
})

/**
 * 초당 한 번 도는 고리 하나. 둘을 한다:
 *   · 놀린 손 풀기 (control.sweep)
 *   · 열린 연결에 ping (프록시가 조용한 연결을 끊는 것을 막는다)
 * 시나리오가 도는 동안에는 프레임 루프가 빠른 박자를 유지하도록 계속 찔러 준다.
 */
setInterval(() => {
    control.sweep()
    if (runner.busy()) screen.poke()
}, 1_000)

// nginx 의 proxy_read_timeout 을 3600s 로 열어 두었지만, 그 사이 아무 말도 없으면
// 중간의 다른 상자가 끊는다. 25초마다 ping 하나면 그 판을 막을 수 있다
setInterval(() => {
    screen.broadcast({ type: 'ping', at: Date.now() })
}, 25_000)

server.listen(PORT, () => {
    console.log(`[aiqa] listening on :${PORT} base=${BASE} app=${device.APP_ID}`)
    console.log(`[aiqa] llm=${llm.enabled() ? 'on' : 'off'} web=${WEB_DIR}`)
})
