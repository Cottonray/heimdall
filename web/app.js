// AI QA 화면 — 서버와의 통신은 **WebSocket 한 줄**이다.
//
//   서버 → 화면 : 바이너리 = JPEG 한 장 / 텍스트 = 상태·로그 JSON
//   화면 → 서버 : 손가락질과 조작 권한 요청 (JSON)
//
// 실행 명령(시작·중지·견주기)만 POST 다. 그건 왕복 한 번이 티가 나지 않고,
// 실패 이유를 상태 코드로 그대로 받는 편이 낫다.

'use strict'

/** nginx 가 접두사를 떼지 않는다. 지금 열려 있는 경로에서 되짚는다 */
const BASE = location.pathname.replace(/\/+$/, '')
const $ = (id) => document.getElementById(id)

const state = {
  viewerId: null,
  control: { kind: 'none' },
  deviceOnline: false,
  running: false,
  /** 마지막 프레임의 objectURL. 다음 장을 걸 때 놓아 준다 */
  frameUrl: null,
  copy: null,
  flows: [],
  timings: [],
  lastEngine: null,
  aiYaml: null,
}

// ── 문구 ──────────────────────────────────────────────────────────────────
// 화면에 뜨는 말은 copy.json 한 파일에서 온다 (샘플 앱과 같은 규약).

async function loadCopy() {
  const res = await fetch(`${BASE}/copy.json`, { cache: 'no-cache' })
  state.copy = await res.json()
  const c = state.copy.ui
  document.title = c.title
  $('title').textContent = c.title
  $('subtitle').textContent = c.subtitle
  $('device-title').textContent = c.deviceTitle
  $('device-hint').textContent = `${c.deviceHint} ${c.keyboardHint}`
  $('claim').textContent = c.claimButton
  $('release').textContent = c.releaseButton
  $('restart-app').textContent = c.restartApp
  $('scenario-title').textContent = c.scenarioTitle
  $('scenario-hint').textContent = c.scenarioHint
  $('stop').textContent = c.stopButton
  $('log-title').textContent = c.logTitle
  $('log').dataset.empty = c.logEmpty
  $('ai-title').textContent = c.aiTitle
  $('ai-hint').textContent = c.aiHint
  $('ai-input').placeholder = c.aiPlaceholder
  $('ai-make').textContent = c.aiButton
  $('ai-run').textContent = c.aiRunButton
  $('diagnose-title').textContent = c.diagnoseTitle
  $('one-device-note').textContent = c.oneDeviceNote
  $('public-note').textContent = c.publicNote
  $('phone-off').firstElementChild.textContent = c.deviceOffline
  document.querySelectorAll('.btn-key').forEach((b) => {
    const map = { back: c.backKey, home: c.homeKey, recent: c.recentKey }
    if (map[b.dataset.key]) b.textContent = map[b.dataset.key]
  })
}

// ── 설정·시나리오 ─────────────────────────────────────────────────────────

async function loadConfig() {
  const res = await fetch(`${BASE}/api/config`, { cache: 'no-store' })
  const cfg = await res.json()
  state.flows = cfg.flows ?? []
  state.timings = cfg.timings ?? []
  state.running = cfg.running
  renderFlows()
  renderTimings()
  if (!cfg.llm) {
    $('ai-state').textContent = 'OpenRouter 키가 없어 이 기능만 꺼져 있어요'
    $('ai-make').disabled = true
    $('ai-input').disabled = true
  }
}

function engine() {
  return document.querySelector('input[name="engine"]:checked').value
}

function renderFlows() {
  const ul = $('flows')
  ul.replaceChildren()
  for (const flow of state.flows) {
    const li = document.createElement('li')
    li.className = 'flow'
    li.dataset.flowId = flow.id

    const copy = document.createElement('div')
    copy.className = 'flow-copy'
    const name = document.createElement('div')
    name.className = 'flow-name'
    name.textContent = flow.name
    const desc = document.createElement('div')
    desc.className = 'flow-desc'
    desc.textContent = flow.desc
    copy.append(name, desc)

    const runBtn = document.createElement('button')
    runBtn.className = 'btn btn-primary'
    runBtn.textContent = state.copy.ui.runButton
    runBtn.onclick = () => post('/api/run', { flowId: flow.id, engine: engine() })

    // 두 갈래를 잇달아 돌려 시간을 견준다. 이 데모의 핵심 단추다
    const cmpBtn = document.createElement('button')
    cmpBtn.className = 'btn'
    cmpBtn.textContent = '견주기'
    cmpBtn.title = '같은 시나리오를 adb → Maestro 순서로 돌려 시간을 잽니다'
    cmpBtn.onclick = () => post('/api/compare', { flowId: flow.id })

    li.append(copy, runBtn, cmpBtn)
    ul.append(li)
  }
  syncRunning()
}

function renderTimings() {
  const body = $('timings-body')
  body.replaceChildren()

  // 시나리오별로 **갈래마다 마지막 성공**만 남긴다. 표가 견주는 표이지 기록장이 아니다
  const byFlow = new Map()
  for (const t of state.timings) {
    if (!t.passed) continue
    const row = byFlow.get(t.flowId) ?? { name: t.name, maestro: null, adb: null }
    row[t.engine] = t.ms
    row.name = t.name
    byFlow.set(t.flowId, row)
  }

  if (byFlow.size === 0) {
    const tr = document.createElement('tr')
    tr.className = 'empty'
    const td = document.createElement('td')
    td.colSpan = 4
    td.textContent = '아직 잰 게 없어요. [견주기] 를 눌러보세요.'
    tr.append(td)
    body.append(tr)
    return
  }

  for (const row of byFlow.values()) {
    const tr = document.createElement('tr')
    const cells = [
      row.name,
      row.maestro == null ? '—' : sec(row.maestro),
      row.adb == null ? '—' : sec(row.adb),
      row.maestro != null && row.adb != null ? diff(row.maestro, row.adb) : '—',
    ]
    cells.forEach((text, i) => {
      const td = document.createElement('td')
      td.textContent = text
      // 빠른 쪽에 표시를 준다 — 숫자만 나란히 두면 어느 쪽이 이겼는지 매번 세어야 한다
      if (row.maestro != null && row.adb != null) {
        if (i === 1 && row.maestro < row.adb) td.className = 'win'
        if (i === 2 && row.adb < row.maestro) td.className = 'win'
      }
      tr.append(td)
    })
    body.append(tr)
  }
}

const sec = (ms) => `${(ms / 1000).toFixed(1)}초`

function diff(maestroMs, adbMs) {
  const fast = Math.min(maestroMs, adbMs)
  const slow = Math.max(maestroMs, adbMs)
  const times = slow / Math.max(1, fast)
  const winner = adbMs < maestroMs ? 'adb' : 'Maestro'
  return `${winner} 가 ${times.toFixed(1)}배 빨라요`
}

// ── 웹소켓 ────────────────────────────────────────────────────────────────

let ws = null
let retry = 0

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${proto}//${location.host}${BASE}/ws`)
  ws.binaryType = 'blob'

  ws.onopen = () => {
    retry = 0
    send({ t: 'hello' })
  }

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') {
      showFrame(ev.data)
      return
    }
    handle(JSON.parse(ev.data))
  }

  ws.onclose = () => {
    setDevice(false)
    // 회선이 잠깐 끊기는 것은 흔하다. 되붙되 점점 뜸하게 — 서버가 죽었을 때 몰아치지 않게
    retry = Math.min(retry + 1, 6)
    setTimeout(connect, 500 * 2 ** (retry - 1))
  }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function showFrame(blob) {
  const url = URL.createObjectURL(blob)
  const img = $('screen')
  const previous = state.frameUrl
  img.src = url
  state.frameUrl = url
  // 새 장이 걸린 뒤에 옛 장을 놓는다. 먼저 놓으면 한 장씩 깜빡인다
  if (previous) setTimeout(() => URL.revokeObjectURL(previous), 200)
  setDevice(true)
}

function handle(msg) {
  switch (msg.type) {
    case 'hello':
      state.viewerId = msg.viewerId
      state.control = msg.control
      state.running = msg.running
      setDevice(msg.deviceOnline)
      setViewers(msg.viewers)
      syncControl()
      syncRunning()
      break
    case 'control':
      state.control = msg.control
      syncControl()
      break
    case 'device':
      setDevice(msg.online)
      break
    case 'viewers':
      setViewers(msg.viewers)
      break
    case 'claim-denied':
      flash(msg.reason === 'runner' ? state.copy.ui.testingLocked : state.copy.ui.claimedByOther)
      break
    case 'run-start':
      state.running = true
      state.lastEngine = msg.engine
      $('log').replaceChildren()
      $('log-engine').textContent = `${msg.name} · ${engineLabel(msg.engine)}`
      $('diagnose-panel').hidden = true
      setStatus('running')
      markFlow(msg.flowId, 'running')
      syncRunning()
      break
    case 'run-log':
      appendLog(msg.line, msg.level)
      break
    case 'run-step':
      appendLog(`${msg.index + 1}/${msg.total} ${msg.label} · ${msg.ms}ms`, 'step')
      break
    case 'run-end':
      state.running = false
      setStatus(msg.passed ? 'passed' : 'failed')
      markFlow(msg.flowId, msg.passed ? 'passed' : 'failed')
      appendLog(
        `${msg.passed ? '통과' : msg.canceled ? '중지' : '실패'} · ${engineLabel(msg.engine)} · ${sec(msg.ms)}`,
        msg.passed ? 'ok' : 'err',
      )
      state.timings.push({
        flowId: msg.flowId,
        name: msg.name,
        engine: msg.engine,
        ms: msg.ms,
        passed: msg.passed,
      })
      renderTimings()
      syncRunning()
      if (!msg.passed && !msg.canceled) void diagnose()
      break
    case 'compare':
      appendLog(
        `견주기 — Maestro ${msg.maestroMs ? sec(msg.maestroMs) : '실패'} · adb ${msg.adbMs ? sec(msg.adbMs) : '실패'}`,
        'ok',
      )
      break
    case 'ping':
      break
  }
}

const engineLabel = (e) => (e === 'adb' ? 'adb 직접' : 'Maestro CLI')

// ── 상태 그리기 ───────────────────────────────────────────────────────────

function setDevice(online) {
  state.deviceOnline = online
  $('phone').classList.toggle('live', online)
  const pill = $('device-pill')
  pill.textContent = online ? '기기 켜짐' : '기기 준비 중'
  pill.className = `pill ${online ? 'on' : 'off'}`
}

function setViewers(n) {
  $('viewers').textContent = `보는 사람 ${n}`
}

function setStatus(kind) {
  const c = state.copy.ui
  const el = $('run-status')
  const text = { running: c.statusRunning, passed: c.statusPassed, failed: c.statusFailed, idle: c.statusIdle }
  el.textContent = text[kind] ?? c.statusIdle
  el.className = `status ${kind === 'idle' ? '' : kind}`
}

function markFlow(flowId, kind) {
  document.querySelectorAll('.flow').forEach((li) => {
    if (li.dataset.flowId !== flowId) {
      li.classList.remove('running')
      return
    }
    li.classList.remove('running', 'passed', 'failed')
    li.classList.add(kind)
  })
}

/** 내가 지금 누를 수 있나. 폰 위의 덮개와 단추 상태가 전부 이 하나를 본다 */
function mine() {
  return state.control.kind === 'human' && state.control.viewerId === state.viewerId
}

function syncControl() {
  const c = state.copy.ui
  const badge = $('control-badge')
  const lock = $('phone-lock')
  const runnerBusy = state.control.kind === 'runner'

  if (runnerBusy) {
    badge.textContent = c.statusRunning
    badge.className = 'badge locked'
    lock.hidden = false
    lock.firstElementChild.textContent = c.testingLocked
  } else if (mine()) {
    badge.textContent = c.controlling
    badge.className = 'badge mine'
    lock.hidden = true
  } else if (state.control.kind === 'human') {
    badge.textContent = c.watchingOnly
    badge.className = 'badge'
    lock.hidden = false
    lock.firstElementChild.textContent = c.claimedByOther
  } else {
    badge.textContent = c.watchingOnly
    badge.className = 'badge'
    lock.hidden = true
  }

  $('claim').hidden = mine()
  $('release').hidden = !mine()
  $('claim').disabled = runnerBusy
  document.querySelectorAll('.btn-key').forEach((b) => (b.disabled = !mine()))
  $('type-send').disabled = !mine()
  $('type-input').disabled = !mine()
}

function syncRunning() {
  $('stop').disabled = !state.running
  document.querySelectorAll('.flow .btn').forEach((b) => (b.disabled = state.running))
  $('ai-run').disabled = state.running
  if (!state.running && $('run-status').textContent === state.copy.ui.statusRunning) setStatus('idle')
}

function appendLog(line, level) {
  const el = $('log')
  const span = document.createElement('span')
  if (level && level !== 'info') span.className = level
  span.textContent = `${line}\n`
  el.append(span)
  // 로그가 길어지면 앞에서 버린다. 브라우저를 며칠 열어 두는 사람이 있다
  while (el.childElementCount > 800) el.firstElementChild.remove()
  el.scrollTop = el.scrollHeight
}

function flash(text) {
  appendLog(`— ${text}`, 'err')
}

// ── 손가락질 ──────────────────────────────────────────────────────────────

const phone = $('phone')
let pressAt = 0
let pressPoint = null

/** 화면 안에서의 위치를 0~1 로. 서버는 브라우저의 확대·축소를 알 필요가 없다 */
function pointOf(ev) {
  const img = $('screen')
  const box = img.getBoundingClientRect()
  // object-fit: contain 이라 실제 그림은 상자보다 작을 수 있다. 그 여백을 빼고 잰다
  const ratio = 720 / 1600
  let w = box.width
  let h = box.width / ratio
  if (h > box.height) {
    h = box.height
    w = box.height * ratio
  }
  const left = box.left + (box.width - w) / 2
  const top = box.top + (box.height - h) / 2
  return { x: (ev.clientX - left) / w, y: (ev.clientY - top) / h }
}

phone.addEventListener('pointerdown', (ev) => {
  if (!mine()) return
  phone.setPointerCapture(ev.pointerId)
  pressAt = Date.now()
  pressPoint = pointOf(ev)
})

phone.addEventListener('pointerup', (ev) => {
  if (!mine() || !pressPoint) return
  const to = pointOf(ev)
  const held = Date.now() - pressAt
  const moved = Math.hypot(to.x - pressPoint.x, to.y - pressPoint.y)

  // 움직였으면 쓸기, 오래 눌렀으면 길게 누르기, 아니면 그냥 탭
  if (moved > 0.04) {
    send({ t: 'swipe', x1: pressPoint.x, y1: pressPoint.y, x2: to.x, y2: to.y, ms: Math.min(600, Math.max(90, held)) })
  } else if (held > 500) {
    send({ t: 'longpress', x: pressPoint.x, y: pressPoint.y })
  } else {
    send({ t: 'tap', x: pressPoint.x, y: pressPoint.y })
  }
  pressPoint = null
})

// 폰에 초점을 두고 키보드를 그대로 쓰는 길. 원격 데스크톱처럼 만들려면 이게 있어야 한다
phone.tabIndex = 0
phone.addEventListener('keydown', (ev) => {
  if (!mine()) return
  if (ev.key === 'Backspace') {
    ev.preventDefault()
    send({ t: 'key', name: 'del' })
  } else if (ev.key === 'Enter') {
    ev.preventDefault()
    send({ t: 'key', name: 'enter' })
  } else if (ev.key === 'Escape') {
    ev.preventDefault()
    send({ t: 'key', name: 'back' })
  } else if (ev.key.length === 1 && !ev.metaKey && !ev.ctrlKey) {
    ev.preventDefault()
    send({ t: 'text', value: ev.key })
  }
})

// ── 단추 ──────────────────────────────────────────────────────────────────

$('claim').onclick = () => send({ t: 'claim' })
$('release').onclick = () => send({ t: 'release' })
$('stop').onclick = () => post('/api/stop', {})
$('restart-app').onclick = () => post('/api/app/restart', {})

document.querySelectorAll('.btn-key').forEach((b) => {
  b.onclick = () => send({ t: 'key', name: b.dataset.key })
})

$('type-send').onclick = sendTyped
$('type-input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') sendTyped()
})

function sendTyped() {
  const input = $('type-input')
  const value = input.value
  if (!value) return
  send({ t: 'text', value })
  input.value = ''
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) flash(data.error ?? `실패 (${res.status})`)
  return data
}

// ── 말로 시나리오 만들기 ──────────────────────────────────────────────────

$('ai-make').onclick = async () => {
  const instruction = $('ai-input').value.trim()
  if (!instruction) return
  $('ai-state').textContent = state.copy.ui.aiThinking
  $('ai-make').disabled = true
  const data = await post('/api/ai/flow', { instruction })
  $('ai-make').disabled = false
  $('ai-state').textContent = ''
  if (!data.ok) return
  state.aiYaml = data.yaml
  $('ai-yaml').textContent = data.yaml
  $('ai-yaml').hidden = false
  $('ai-run-row').hidden = false
}

$('ai-run').onclick = () => {
  if (!state.aiYaml) return
  // 만든 시나리오도 지금 고른 갈래로 돈다 — 견주기가 저장된 시나리오에만 되면 반쪽이다
  post('/api/run-adhoc', { name: '말로 만든 시나리오', yaml: state.aiYaml, engine: engine() })
}

// ── 실패 원인 ─────────────────────────────────────────────────────────────

async function diagnose() {
  const panel = $('diagnose-panel')
  panel.hidden = false
  $('diagnose-state').textContent = state.copy.ui.diagnoseThinking
  $('diagnose').textContent = ''
  const data = await post('/api/ai/diagnose', {})
  $('diagnose-state').textContent = ''
  if (!data.ok) {
    $('diagnose').textContent = data.error ?? '원인을 보지 못했어요'
    return
  }
  // **모델이 준 글을 HTML 로 해석하지 않는다.** `**굵게**` 만 우리가 바꿔 준다
  const frag = document.createDocumentFragment()
  for (const chunk of data.text.split(/(\*\*[^*]+\*\*)/)) {
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      const b = document.createElement('strong')
      b.textContent = chunk.slice(2, -2)
      frag.append(b)
    } else {
      frag.append(document.createTextNode(chunk))
    }
  }
  $('diagnose').replaceChildren(frag)
}

// ── 시작 ──────────────────────────────────────────────────────────────────

void (async () => {
  await loadCopy()
  await loadConfig()
  setStatus('idle')
  syncControl()
  connect()
})()
