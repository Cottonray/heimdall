import { authenticate, authEvents, localRequest } from "./studio/infrastructure/auth.ts"
// QA Studio 서버. 구형 모바일 QA 화면·API·WebSocket은 2026-10-08 폐기했다.
// Studio와 Android 샘플 앱의 WebView 자산만 제공한다.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { accept } from './ws.ts'
import * as studio from './studio.ts'
import { prepareRemoteDevice, RemoteDeviceError } from './studio/infrastructure/remote-device.ts'
import { connectRemoteDevice } from './studio/transport/remote-device.ts'

const BASE = process.env.AIQA_BASE_PATH ?? '/aiqa'
const PORT = Number(process.env.AIQA_PORT ?? 8080)
const WEB_DIR = process.env.AIQA_WEB_DIR ?? path.join(import.meta.dirname, '..', '..', 'web')
const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
}
function json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
}
async function serveStatic(res: http.ServerResponse, relative: string) {
    const root = path.resolve(WEB_DIR)
    const file = path.resolve(root, relative)
    if (!file.startsWith(`${root}${path.sep}`)) return json(res, 403, { error: 'forbidden' })
    try {
        const body = await readFile(file)
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
        res.end(body)
    } catch {
        json(res, 404, { error: 'not found' })
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('ok\n')
        return
    }
    if (url.pathname === BASE || url.pathname === `${BASE}/` || url.pathname === '/') {
        res.writeHead(302, { location: `${BASE}/studio/`, 'cache-control': 'no-store' })
        res.end()
        return
    }
    if (!url.pathname.startsWith(`${BASE}/`)) return json(res, 404, { error: 'not found' })
    const route = url.pathname.slice(BASE.length)
    try {
        if (await studio.handle(req, res, route)) return
        if (route === '/studio' || route === '/studio/login' || route === '/studio/' || route === '/studio/index.html' || /^\/studio\/assets\/[a-zA-Z0-9._-]+\.(?:js|css|woff2|svg)$/.test(route)) {
            if (!studio.allowed(req)) return json(res, 403, { error: '로그인 후 QA Studio를 이용해 주세요' })
            if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
            if (route === '/studio') {
                res.writeHead(302, { location: `${BASE}/studio/` })
                res.end()
                return
            }
            await serveStatic(res, route.startsWith('/studio/assets/') ? route.slice(1) : 'studio/index.html')
            return
        }
        // Studio가 테스트하는 Android 샘플 앱의 WebView. 구형 QA 콘솔과 별개다.
        if (req.method === 'GET' && /^\/webapp\/(?:index\.html|app\.css|app\.js|copy\.json)?$/.test(route)) {
            await serveStatic(res, route === '/webapp/' ? 'webapp/index.html' : route.slice(1))
            return
        }
        // 이전에 열어둔 탭도 더 이상 기기나 실행기에 접근하지 못한다.
        json(res, 410, { error: '구형 AI QA 데모는 폐기했어요. 쇼룸에서 QA Studio를 열어 주세요.' })
    } catch {
        if (!res.headersSent) json(res, 500, { error: '요청을 처리하지 못했어요' })
        else res.end()
    }
})
server.on('upgrade', async (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== `${BASE}/studio/ws` || !studio.allowed(req)) {
        socket.write('HTTP/1.1 410 Gone\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
    }
    try {
        const remoteRequested = url.searchParams.has('device')
        const auth = await authenticate(req)
        if (!auth && (remoteRequested || !localRequest(req))) {
            socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
            socket.destroy()
            return
        }
        const ws = accept(req, socket)
        if (ws) {
            const guard = async () => (!remoteRequested && localRequest(req)) || !!await authenticate(req)
            if (auth) {
                const revoke = (hash: string) => { if (hash === auth.hash) ws.close(4401) }
                authEvents.on('revoke', revoke)
                const expiry = setInterval(() => { if (auth.expires <= Date.now()) ws.close(4401) }, 30000)
                socket.on('close', () => { authEvents.off('revoke', revoke); clearInterval(expiry) })
            }
            if (remoteRequested) {
                try {
                    const remote = await prepareRemoteDevice(url.searchParams.get('device') ?? '')
                    if (!ws.isOpen) return
                    if (!await guard()) { ws.close(4401); return }
                    if (ws.isOpen) connectRemoteDevice(ws, remote, guard)
                } catch (error) {
                    const known = error instanceof RemoteDeviceError
                    ws.send(JSON.stringify({ type: 'error', error: known ? error.message : '기기 상태를 확인하지 못했어요. 다시 열어 주세요' }))
                    ws.close(known && error.status < 500 ? (error.status === 404 ? 4404 : 4409) : 4503)
                }
            } else studio.connect(ws, guard)
        }
    } catch { socket.destroy() }
})
server.listen(PORT, () => console.log(`[aiqa] QA Studio listening on :${PORT} base=${BASE}`))
