import http from 'node:http'
import { chromium } from 'playwright'
import type { BrowserContext, Page } from 'playwright'
import { readFile } from 'node:fs/promises'

const allowed = new Set((process.env.AIQA_TEST_ORIGINS || 'http://127.0.0.1:8081').split(','))
const sessions = new Map<string, { context: BrowserContext; page: Page; logs: unknown[]; at: number }>()
const browser = await chromium.launch({ headless: true })
let opening = 0
function checkUrl(value: string) {
    const url = new URL(value)
    if (!allowed.has(url.origin) || url.username || url.password) throw new Error('관리자가 등록한 테스트 주소만 열 수 있어요')
    return url.href
}
function get(id: string) { const s = sessions.get(id); if (!s) throw new Error('종료된 브라우저예요'); s.at = Date.now(); return s }
async function observe(page: Page) {
    return { url: page.url(), title: await page.title(), tree: (await page.locator('body').ariaSnapshot()).slice(0, 18000), elements: await page.locator('input,textarea,button,a,select').evaluateAll(nodes => nodes.slice(0,80).map(el => ({ text: el.textContent?.trim().slice(0,100), selector: el.id ? '#' + CSS.escape(el.id) : undefined, placeholder: el.getAttribute('placeholder'), label: el.getAttribute('aria-label') }))) }
}
async function operate(id: string, a: any) {
    const s = get(id), p = s.page
    const locator = () => a.selector ? p.locator(String(a.selector)).first() : p.getByText(String(a.text), { exact: true }).first()
    switch (a.type) {
        case 'goto': await p.goto(checkUrl(String(a.url)), { waitUntil: 'domcontentloaded' }); break
        case 'click': await locator().click(); break
        case 'point': {
            const x = Number(a.x), y = Number(a.y)
            if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('잘못된 좌표예요')
            // Capture a stable selector BEFORE navigation; the recorded action remains replayable.
            const target = await p.evaluate(({ x, y }) => {
                const el = document.elementFromPoint(x, y)?.closest('button,a,input,select,textarea,[role="button"]') as HTMLElement | null
                if (!el) return null
                if (el.id) return { selector: '#' + CSS.escape(el.id) }
                if (el.getAttribute('data-testid')) return { selector: '[data-testid=' + JSON.stringify(el.getAttribute('data-testid')) + ']' }
                return el.textContent?.trim() ? { text: el.textContent.trim() } : null
            }, { x, y })
            await p.mouse.click(x, y)
            if (target) Object.assign(a, { type: 'click', ...target })
            break
        }
        case 'fill': await locator().fill(String(a.value ?? '')); break
        case 'type': await p.keyboard.insertText(String(a.value ?? '')); break
        case 'key': await p.keyboard.press(String(a.key)); break
        case 'scroll': await p.mouse.wheel(0, a.direction === 'up' ? -550 : 550); break
        case 'assert': await p.getByText(String(a.text), { exact: false }).first().waitFor({ state: 'visible', timeout: 6000 }); break
        case 'api': {
            const r = await s.context.request.get(checkUrl(String(a.url)), { maxRedirects: 0, timeout: 10000 })
            const status = r.status()
            if (status !== Number(a.status ?? 200)) throw new Error(`API 응답 ${status}, 기대값 ${a.status ?? 200}`)
            const content = (await r.text()).slice(0, 8000)
            if (a.contains && !content.includes(String(a.contains))) throw new Error('API 응답에서 기대한 값을 찾지 못했어요')
            return { action: a, status, body: content }
        }
        default: throw new Error('지원하지 않는 브라우저 동작이에요')
    }
    return { action: a, ...await observe(p) }
}
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const reply = (status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)) }
    try {
        if (url.pathname === '/healthz') return reply(200, { ok: browser.isConnected(), active: sessions.size, capacity: 2 })
        if (url.pathname === '/demo/api/accounts') return reply(200, { accounts: [{ name: 'QA 테스트 계좌', balance: 1250000 }], demo: true })
        if (url.pathname === '/demo/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(await readFile(new URL('./demo.html', import.meta.url))); return }
        const id = url.searchParams.get('id') || ''
        if (url.pathname === '/frame') { const s = get(id); res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(await s.page.screenshot({ type: 'jpeg', quality: 65 })); return }
        if (url.pathname === '/observe') return reply(200, { ...await observe(get(id).page), logs: get(id).logs.slice(-60) })
        let text = ''; for await (const b of req) { text += b; if (text.length > 64000) throw new Error('요청이 너무 커요') }
        const data = JSON.parse(text || '{}')
        if (url.pathname === '/open') {
            if (sessions.size + opening >= 2) throw new Error('브라우저 워커 두 개가 사용 중이에요')
            if (sessions.has(data.id)) throw new Error('이미 열린 세션이에요')
            const target = checkUrl(data.url || 'http://127.0.0.1:8081/demo/')
            opening++
            let context: BrowserContext
            try { context = await browser.newContext({ viewport: data.mobile ? { width: 390, height: 844 } : { width: 1100, height: 720 }, isMobile: !!data.mobile, hasTouch: !!data.mobile, serviceWorkers: 'block' }) } catch (e) { opening--; throw e }
            try {
            const logs: unknown[] = []
            const log = (v: unknown) => { logs.push({ at: new Date().toISOString(), ...v as object }); if (logs.length > 150) logs.shift() }
            await context.route('**/*', route => {
                try { checkUrl(route.request().url()); return route.continue() } catch { return route.abort('blockedbyclient') }
            })
            const page = await context.newPage()
            page.setDefaultTimeout(7000)
            page.on('console', m => log({ type: 'console', level: m.type(), text: m.text().slice(0, 1000) }))
            page.on('pageerror', e => log({ type: 'error', text: e.message }))
            page.on('response', r => log({ type: 'network', status: r.status(), url: r.url().split('?')[0] }))
            page.on('requestfailed', r => log({ type: 'network-error', url: r.url().split('?')[0], text: r.failure()?.errorText }))
            // Reserve the slot before navigation so simultaneous opens cannot exceed capacity.
            sessions.set(data.id, { context, page, logs, at: Date.now() })
            try { await page.goto(target, { waitUntil: 'domcontentloaded' }) } catch (e) { sessions.delete(data.id); await context.close(); throw e }
            return reply(200, await observe(page))
            } finally { opening-- }
        }
        if (url.pathname === '/action') return reply(200, await operate(data.id, data.action))
        if (url.pathname === '/close') { const s = sessions.get(data.id); sessions.delete(data.id); await s?.context.close(); return reply(200, { ok: true }) }
        reply(404, { error: 'not found' })
    } catch (e) { reply(400, { error: String(e).slice(0, 700) }) }
})
server.listen(8081)
setInterval(() => { for (const [id, s] of sessions) if (Date.now() - s.at > 30 * 60000) { sessions.delete(id); void s.context.close() } }, 60000).unref()
