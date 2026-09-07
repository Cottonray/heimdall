// 화면만 고칠 때 홈서버 없이 그려 보는 가짜 서버 (2026-09-07).
//
//   node --experimental-strip-types deploy/aiqa/dev/mock.ts     # http://127.0.0.1:8711/aiqa/
//
// 진짜 서버의 ws.ts 를 그대로 빌려 쓰고, 에뮬레이터 대신 라이브에서 받아 둔 프레임 한 장
// (frame.jpg)을 돌린다. 실행은 타이머로 흉내 낸다 — [실행] 을 누르면 단계가 하나씩 오고,
// 「상품 검색」은 네 번째 단계에서 일부러 떨어져 실패 요약까지 보여 준다.
//
// **헤드리스 스크린샷용 재생.** 페이지 주소에 ?replay=running|failed|passed 를 붙이면
// 사람이 누르지 않아도 그 장면이 지연 없이 채워진다 (docs/aiqa.md §화면).
//
// 배포에는 안 실린다 — deploy.sh 가 server·web·flows·sample-app 만 보낸다.
import http from 'node:http'
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { accept, type WsConnection } from '../server/src/ws.ts'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')
const WEB = path.join(ROOT, 'web')
const FLOWS = path.join(ROOT, 'flows')
const BASE = '/aiqa'
const PORT = Number(process.env.PORT ?? 8711)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const frame = await readFile(path.join(HERE, 'frame.jpg'))

async function flows() {
  const names = (await readdir(FLOWS)).filter((n) => n.endsWith('.yaml')).sort()
  const out = []
  for (const file of names) {
    const yaml = await readFile(path.join(FLOWS, file), 'utf8')
    const id = file.replace(/\.yaml$/, '')
    const m = yaml.split('\n', 1)[0].match(/^#\s*(.+?)(?:\s+—\s+(.*))?$/)
    out.push({ id, name: m?.[1]?.trim() || id, desc: m?.[2]?.trim() ?? '', yaml })
  }
  return out
}

// 문서의 실측표를 그대로 넣는다 (2026-09-04)
const MEASURED: Record<string, [number, number, number]> = {
  '01-home': [10.2, 6.3, 3.9],
  '02-search': [15.5, 6.2, 8.0],
  '03-detail': [11.7, 5.4, 5.5],
  '04-chat': [19.9, 6.7, 12.1],
  '05-sell': [20.8, 6.6, 12.4],
  '06-tabs': [21.0, 8.5, 14.0],
  '07-hybrid-coupon': [18.1, 8.6, 12.7],
  '08-hybrid-entry': [30.1, 12.1, 22.8],
}
const timings: any[] = []
const runs: any[] = []
let seq = 0
function seed(list: any[]) {
  let at = Date.now() - 3600_000 * 5
  for (const f of list) {
    const m = MEASURED[f.id]
    if (!m) continue
    for (const [i, engine] of ['maestro', 'appium', 'adb'].entries()) {
      at += 60_000
      timings.push({ flowId: f.id, name: f.name, engine, ms: Math.round(m[i] * 1000), passed: true, canceled: false, at })
    }
  }
  const fixtures = [
    ['홈 화면 확인', 'appium', true, 5600, 4, false],
    ['홈 화면 확인', 'adb', true, 4200, 4, false],
    ['대화형 시나리오', 'appium', true, 8200, 7, true],
    ['대화형 시나리오', 'appium', false, 6800, 4, false],
    ['웹→앱 응모', 'maestro', true, 33400, 15, false],
    ['앱→웹→앱 쿠폰', 'adb', true, 12700, 10, false],
  ] as const
  let t = Date.now() - 90_000
  for (const [flowName, engine, passed, ms, steps, hasVideo] of fixtures) {
    t -= 7 * 60_000
    runs.push({ runId: `run-${++seq}`, flowName, engine, passed, ms, at: t, steps, hasVideo })
  }
}

// ── 화면 연결 ─────────────────────────────────────────────────────────────
const conns = new Set<WsConnection>()
let pendingReplay = ''
let replayed = false
let control: any = { kind: 'none' }
let running = false
let viewers = 0
function broadcast(msg: unknown) {
  const text = JSON.stringify(msg)
  for (const c of conns) c.send(text)
}

const STEPS: Record<string, string[]> = {
  default: ['launchApp clearState', 'assertVisible "망원동"', 'tapOn "전체"', 'assertVisible "원목 접이식 테이블"'],
  '02-search': ['launchApp clearState', 'tapOn id: "search"', 'tapOn id: "search_input"', 'inputText "자전거"', 'pressKey Enter', 'assertVisible ".*자전거.*"'],
  '08-hybrid-entry': ['launchApp clearState', 'tapOn id: "event_open"', 'tapOn "응모 탭"', 'tapOn "이름"', 'inputText "김골목"', 'tapOn "응모"', 'assertVisible "응모가 접수됐어요"', 'back', 'tapOn id: "tab_4"', 'assertVisible "응모한 물건"'],
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function simulateRun(flow: any, engine: string, fail = false) {
  if (running) return { ok: false, error: '이미 다른 시나리오가 도는 중이에요' }
  running = true
  const runId = `run-${++seq}`
  const steps = STEPS[flow.id] ?? STEPS.default
  const startedAt = Date.now()
  control = { kind: 'runner', label: flow.name }
  broadcast({ type: 'control', control })
  broadcast({ type: 'run-start', runId, flowId: flow.id, name: flow.name, engine, at: startedAt, steps: engine === 'maestro' ? 0 : steps.length, record: false })
  broadcast({ type: 'run-log', runId, line: `${engine} 로 시작 · 기기 emulator-5554`, level: 'info' })
  if (engine === 'appium') broadcast({ type: 'run-log', runId, line: '세션 여는 중 (UiAutomator2)', level: 'info' })
  await sleep(engine === 'appium' ? 1400 : 500)
  let passed = true
  for (let i = 0; i < steps.length; i += 1) {
    await sleep(350 + Math.random() * 500)
    const ok = !(fail && i === 3)
    const ms = Math.round(200 + Math.random() * 900)
    broadcast({ type: 'run-log', runId, line: `${steps[i]}`, level: 'info' })
    broadcast({ type: 'run-step', runId, index: i, total: steps.length, label: steps[i], ms, ok })
    if (!ok) {
      broadcast({ type: 'run-log', runId, line: `Element not found: ${steps[i]} (waited 6s)`, level: 'err' })
      passed = false
      break
    }
  }
  const ms = Date.now() - startedAt
  broadcast({ type: 'run-end', runId, flowId: flow.id, name: flow.name, engine, passed, ms, canceled: false })
  timings.push({ flowId: flow.id, name: flow.name, engine, ms, passed, canceled: false, at: startedAt })
  runs.unshift({ runId, flowName: flow.name, engine, passed, ms, at: startedAt, steps: steps.length, hasVideo: false })
  broadcast({ type: 'evidence', artifact: { runId, hasVideo: false } })
  control = { kind: 'none' }
  broadcast({ type: 'control', control })
  running = false
  return { ok: true, ms }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let route = url.pathname
  if (route === BASE) {
    res.writeHead(302, { location: `${BASE}/` })
    res.end()
    return
  }
  if (route.startsWith(`${BASE}/`)) route = route.slice(BASE.length)
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  const body = async () => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  }
  const list = await flows()
  if (timings.length === 0) seed(list)

  if (route === '/api/config') {
    try {
      pendingReplay = new URL(req.headers.referer ?? '', 'http://localhost').searchParams.get('replay') ?? ''
    } catch {}
    return json(200, {
      appId: 'com.aidemo.golmok',
      device: { width: 720, height: 1600 },
      control,
      running,
      viewers,
      llm: true,
      appium: true,
      serial: 'emulator-5554',
      devices: [{ serial: 'emulator-5554', kind: 'emulator', model: 'sdk_gphone64_x86_64', state: 'device', selectable: true }],
      engines: ['adb', 'appium', 'maestro'],
      timings,
      flows: list,
    })
  }
  if (route === '/api/runs') return json(200, { runs })
  if (route === '/api/devices') return json(200, { serial: 'emulator-5554', devices: [{ serial: 'emulator-5554', kind: 'emulator', model: 'sdk_gphone64_x86_64', state: 'device', selectable: true }] })
  if (route === '/api/screen/elements')
    return json(200, {
      texts: ['망원동', '전체', '가까운 순', '예약 제외', '나눔', '망원동 이웃 쿠폰이 왔어요', '열기', '원목 접이식 테이블', '38,000원', '무선 키보드와 마우스', '25,000원', '글쓰기', '홈', '동네생활', '내 근처', '채팅', '나의 골목'],
      ids: ['tab_0', 'tab_1', 'tab_2', 'tab_3', 'tab_4', 'event_open', 'search', 'sell_fab', 'town_name'],
    })
  if (route === '/api/timings') return json(200, { timings })
  if (req.method === 'POST' && route === '/api/run') {
    const b = await body()
    const flow = list.find((f) => f.id === b.flowId)
    if (!flow) return json(400, { ok: false, error: '없는 시나리오예요' })
    void simulateRun(flow, b.engine ?? 'appium', b.flowId === '02-search')
    return json(200, { ok: true })
  }
  if (req.method === 'POST' && route === '/api/run-adhoc') {
    const b = await body()
    void simulateRun({ id: 'adhoc', name: b.name ?? '편집기 시나리오' }, b.engine ?? 'appium')
    return json(200, { ok: true })
  }
  if (req.method === 'POST' && route === '/api/compare') {
    const b = await body()
    const flow = list.find((f) => f.id === b.flowId)
    if (!flow) return json(400, { ok: false, error: '없는 시나리오예요' })
    void (async () => {
      const results: any[] = []
      for (const engine of ['adb', 'appium', 'maestro']) {
        const r = await simulateRun(flow, engine)
        results.push({ engine, ms: r.ms ?? null })
      }
      broadcast({ type: 'compare', flowId: flow.id, name: flow.name, results, at: Date.now() })
    })()
    return json(200, { ok: true })
  }
  if (req.method === 'POST' && route === '/api/stop') return json(200, { ok: true })
  if (req.method === 'POST' && route === '/api/app/restart') return json(200, { ok: true })
  if (req.method === 'POST' && route === '/api/devices/select') return json(200, { ok: true })
  if (req.method === 'POST' && route === '/api/ai/chat') {
    const b = await body()
    const n = (b.messages ?? []).filter((m: any) => m.role === 'user').length
    await sleep(900)
    if (n < 2) return json(200, { ok: true, say: '검색 결과 목록까지만 볼까요, 상세 화면까지 들어가 볼까요?', choices: ['결과 목록까지', '상세까지', '지우고 다시 검색'] })
    return json(200, {
      ok: true,
      say: '상세까지 들어가는 시나리오로 짤게요. 검색어는 "자전거"로 뒀어요.',
      choices: [],
      yaml: 'appId: com.aidemo.golmok\n---\n- launchApp:\n    clearState: true\n- tapOn:\n    id: "search"\n- tapOn:\n    id: "search_input"\n- inputText: "자전거"\n- pressKey: Enter\n- assertVisible: ".*자전거.*"\n- tapOn: ".*자전거.*"\n- assertVisible: "채팅하기"\n',
    })
  }
  if (req.method === 'POST' && route === '/api/ai/diagnose') {
    await sleep(replayed ? 50 : 1200)
    return json(200, { ok: true, text: '**검색어를 넣기 전에 입력칸을 누르지 않았어요.** `inputText` 는 포커스가 가 있는 칸에 들어가는데, 그때 화면에는 검색 화면이 열려 있었지만 커서가 칸에 없었어요. `tapOn: id: "search_input"` 을 한 줄 앞에 넣으면 지나갑니다.' })
  }
  // 정적 파일
  const safe = path.normalize(route).replace(/^(\.\.[/\\])+/, '')
  const rooted = safe === '' || safe === '/' ? 'index.html' : safe.endsWith('/') ? `${safe}index.html` : safe
  try {
    const file = path.join(WEB, rooted)
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
    res.end(data)
  } catch {
    json(404, { error: 'not found' })
  }
})

// 헤드리스 스크린샷용 — 페이지 주소의 ?replay=failed|running|passed 를 ws 의 Referer 로 읽어
// 그 연결에만 실행 장면을 지연 없이 재생한다. 사람이 누르지 않아도 결과 판이 채워진다.
function replay(conn: WsConnection, kind: string) {
  const runId = 'run-replay'
  const flow = { id: '02-search', name: '상품 검색' }
  const steps = STEPS['02-search']
  const say = (m: unknown) => conn.send(JSON.stringify(m))
  say({ type: 'control', control: { kind: 'runner', label: flow.name } })
  say({ type: 'run-start', runId, flowId: flow.id, name: flow.name, engine: 'appium', at: Date.now(), steps: steps.length, record: false })
  say({ type: 'run-log', runId, line: 'appium 로 시작 · 기기 emulator-5554', level: 'info' })
  say({ type: 'run-log', runId, line: '세션 여는 중 (UiAutomator2) · 2.9초', level: 'info' })
  const upto = kind === 'running' ? 2 : kind === 'failed' ? 4 : steps.length
  const mss = [848, 738, 344, 778, 512, 903]
  for (let i = 0; i < upto; i += 1) {
    const ok = !(kind === 'failed' && i === 3)
    say({ type: 'run-log', runId, line: steps[i], level: 'info' })
    say({ type: 'run-step', runId, index: i, total: steps.length, label: steps[i], ms: mss[i], ok })
    if (!ok) say({ type: 'run-log', runId, line: `Element not found: ${steps[i]} (waited 6s)`, level: 'err' })
  }
  if (kind === 'running') return
  const passed = kind === 'passed'
  say({ type: 'run-end', runId, flowId: flow.id, name: flow.name, engine: 'appium', passed, ms: passed ? 7123 : 5804, canceled: false })
  say({ type: 'evidence', artifact: { runId, hasVideo: false } })
  say({ type: 'control', control: { kind: 'none' } })
}

server.on('upgrade', (req, socket) => {
  const conn = accept(req, socket)
  if (!conn) return
  conns.add(conn)
  viewers = conns.size
  const viewerId = `v-${Math.random().toString(36).slice(2, 8)}`
  const replayKind = pendingReplay
  pendingReplay = ''
  if (replayKind) replayed = true
  conn.on({
    onMessage: (text) => {
      const msg = JSON.parse(text)
      if (msg.t === 'hello') {
        conn.send(JSON.stringify({ type: 'hello', viewerId, control, running, size: { width: 720, height: 1600 }, deviceOnline: true, viewers }))
        broadcast({ type: 'viewers', viewers })
        conn.sendBinary(frame)
        if (replayKind) replay(conn, replayKind)
      } else if (msg.t === 'claim') {
        if (control.kind === 'none') {
          control = { kind: 'human', viewerId }
          broadcast({ type: 'control', control })
        } else conn.send(JSON.stringify({ type: 'claim-denied', reason: control.kind }))
      } else if (msg.t === 'release') {
        control = { kind: 'none' }
        broadcast({ type: 'control', control })
      }
    },
    onClose: () => {
      conns.delete(conn)
      viewers = conns.size
      broadcast({ type: 'viewers', viewers })
    },
  })
})

setInterval(() => {
  for (const c of conns) c.sendBinary(frame)
}, 900)

server.listen(PORT, '127.0.0.1', () => console.log(`mock http://127.0.0.1:${PORT}${BASE}/`))
