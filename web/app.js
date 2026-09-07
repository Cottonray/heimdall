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
  appId: '',
  /** 지금 보는 기기의 화면 크기. **기기마다 다르다** — 좌표 환산과 폰 틀 비율이 이걸 본다 */
  size: { width: 720, height: 1600 },
  devices: [],
  serial: '',
  /** OpenRouter 키가 있나. 없으면 대화 판만 꺼진다 */
  llm: true,
  /**
   * 지금 그리고 있는 실행 하나. run-start 에서 비우고 run-step 이 채운다.
   * 화면의 "실행 결과" 판(단계 목록·진행 막대·걸린 시간)이 전부 이걸 본다.
   */
  run: null,
}

// ── 문구 ──────────────────────────────────────────────────────────────────
// 화면에 뜨는 말은 copy.json 한 파일에서 온다 (샘플 앱과 같은 규약).

async function loadCopy() {
  const res = await fetch(`${BASE}/copy.json`, { cache: 'no-cache' })
  state.copy = await res.json()
  const c = state.copy.ui
  const text = (id, value) => {
    const el = $(id)
    if (el && value != null) el.textContent = value
  }
  document.title = c.title
  text('title', c.title)
  text('tagline', c.tagline)
  text('gallery-link', c.galleryLink)
  $('device-pill').lastElementChild.textContent = c.deviceChecking

  // 기기
  text('device-eyebrow', c.deviceEyebrow)
  text('device-title', c.deviceTitle)
  text('device-hint', `${c.deviceHint} ${c.claimHint}`)
  text('release', c.releaseButton)
  text('restart-app', c.restartApp)
  text('type-send', c.typeSend)
  $('type-input').placeholder = c.typePlaceholder
  text('rules-title', c.rulesTitle)
  text('one-device-note', c.oneDeviceNote)
  text('public-note', c.publicNote)
  $('phone-off').firstElementChild.textContent = c.deviceOffline
  const keys = { back: c.backKey, home: c.homeKey, recent: c.recentKey, enter: c.enterKey, del: c.delKey }
  document.querySelectorAll('.key').forEach((b) => {
    if (keys[b.dataset.key]) b.textContent = keys[b.dataset.key]
  })

  // 실행
  text('run-eyebrow', c.runEyebrow)
  text('scenario-title', c.scenarioTitle)
  text('scenario-hint', c.scenarioHint)
  document.querySelector('.engines').setAttribute('aria-label', c.engineLabel)
  for (const el of document.querySelectorAll('.engine')) {
    const e = c.engines?.[el.dataset.engine]
    if (!e) continue
    el.querySelector('.engine-name').textContent = e.name
    el.querySelector('.engine-why').textContent = e.why
    // 폰에서는 설명이 감춰진다 — 길게 누르면(title) 읽을 수 있게 남겨 둔다
    el.title = e.why
  }
  text('stop', c.stopButton)
  text('record-label', c.recordLabel)
  text('record-note', c.recordNote)
  $('record-switch').title = c.recordNote

  // 결과
  text('result-eyebrow', c.resultEyebrow)
  text('result-empty', c.resultEmpty)
  text('log-title', c.logTitle)
  $('log').dataset.empty = c.logEmpty
  text('diagnose-title', c.diagnoseTitle)

  // 비교
  text('compare-eyebrow', c.compareEyebrow)
  text('timing-title', c.timingTitle)
  text('timing-hint', c.timingHint)
  text('th-scenario', c.scenarioTitle)
  text('th-fastest', c.fastestLabel)

  // AI
  text('chat-eyebrow', c.chatEyebrow)
  text('chat-title', c.chatTitle)
  text('chat-hint', c.chatHint)
  $('chat-input').placeholder = c.chatPlaceholder
  text('chat-send', c.chatSend)
  text('chat-reset', c.chatReset)

  // 증적
  text('evidence-eyebrow', c.evidenceEyebrow)
  text('evidence-title', c.evidenceTitle)
  text('evidence-hint', c.evidenceHint)

  // 폰의 바닥 탭
  text('tab-device', c.tabDevice)
  text('tab-run', c.tabRun)
  text('tab-ai', c.tabAi)
  text('tab-evidence', c.tabEvidence)

  // 편집기
  text('editor-eyebrow', c.editorEyebrow)
  text('editor-title', c.editorTitle)
  text('editor-summary', c.editorSummary)
  text('editor-hint', c.editorHint)
  text('load-label', c.loadLabel)
  text('commands-label', c.commandsLabel)
  text('commands-hint', c.commandsHint)
  text('elements-label', c.elementsLabel)
  text('elements-hint', c.elementsHint)
  text('elements-refresh', c.elementsRefresh)
  text('yaml-label', c.yamlLabel)
  $('yaml').placeholder = c.yamlPlaceholder
  text('editor-run', c.runLabel)
  text('editor-clear', c.clearLabel)
  text('saved-note', c.savedNote)
}

// ── 설정·시나리오 ─────────────────────────────────────────────────────────

async function loadConfig() {
  const res = await fetch(`${BASE}/api/config`, { cache: 'no-store' })
  const cfg = await res.json()
  state.flows = cfg.flows ?? []
  state.timings = cfg.timings ?? []
  state.running = cfg.running
  state.appId = cfg.appId
  state.devices = cfg.devices ?? []
  state.serial = cfg.serial ?? ''
  if (cfg.device && cfg.device.width) applySize({ width: cfg.device.width, height: cfg.device.height })
  renderDevices()
  renderFlows()
  renderTimings()
  renderLoadOptions()
  renderCommands()
  resetEditor()
  // Appium 서버가 아직 안 떴으면 그 방식만 고르지 못하게 한다 — 눌러 놓고 "왜 안 되지"
  // 하는 것보다 낫다. 기동에 30초쯤 걸리므로 화면을 열자마자면 이 상태일 수 있다
  const appiumRadio = document.querySelector('input[name="engine"][value="appium"]')
  if (appiumRadio && cfg.appium === false) {
    appiumRadio.disabled = true
    appiumRadio.closest('.engine').title = state.copy.ui.appiumNotReady
    appiumRadio.closest('.engine').classList.add('engine--off')
    // **Appium 이 기본으로 골라져 있다.** 그 칸을 잠그기만 하면 아무것도 안 골라진 상태가
    // 되고, 실행을 누르는 순간 engine() 이 null 을 읽어 화면이 통째로 멈춘다
    document.querySelector('input[name="engine"][value="maestro"]').checked = true
  }
  // 키가 없으면 **이 판만** 꺼진다. 편집기(불러오기·명령 단추·화면 요소·직접 쓰기)도
  // 실행도 견주기도 그대로 돈다 — 꺼진 자리를 화면이 밝혀 두는 편이 낫다
  state.llm = cfg.llm !== false
  if (!state.llm) {
    $('chat-state').textContent = state.copy.ui.chatOff
    $('chat-send').disabled = true
    $('chat-input').disabled = true
  }
  greet()
}

/**
 * 붙어 있는 기기 목록.
 *
 * **고를 수 있는 것만 고르게 둔다.** 공개 화면이라 아무나 열 수 있고, 목록에 실기기가
 * 있다고 해서 모르는 사람이 그 폰을 조작할 수 있으면 안 된다 — 서버가 허용 목록으로
 * 막고(devices.ts), 화면은 그 사실을 잠긴 모양으로 보여 준다.
 */
async function loadDevices() {
  const res = await fetch(`${BASE}/api/devices`, { cache: 'no-store' })
  const data = await res.json().catch(() => null)
  if (!data) return
  state.devices = data.devices ?? []
  state.serial = data.serial ?? ''
  renderDevices()
}

function renderDevices() {
  const box = $('devices')
  box.replaceChildren()
  if (state.devices.length <= 1 && state.devices.every((d) => d.kind === 'emulator')) {
    // 에뮬레이터 하나뿐이면 고를 것이 없다. 줄만 차지한다
    box.hidden = true
    return
  }
  box.hidden = false

  for (const d of state.devices) {
    const b = document.createElement('button')
    b.className = 'btn btn-sm device'
    b.textContent = `${d.kind === 'emulator' ? '에뮬레이터' : d.model || d.serial}`
    b.title = `${d.serial} · ${d.state}`
    if (d.serial === state.serial) b.classList.add('device--on')
    if (!d.selectable) {
      b.disabled = true
      b.classList.add('device--locked')
      b.title += ' · 공개 화면에서는 고를 수 없어요'
    }
    b.onclick = () => post('/api/devices/select', { serial: d.serial })
    box.append(b)
  }
}

function engine() {
  return document.querySelector('input[name="engine"]:checked').value
}

/** 화면 녹화를 켠 실행인가. **켜면 기기가 느려져 시간 비교가 흔들린다** */
function recording() {
  return $('record').checked
}

// ── 증적 ──────────────────────────────────────────────────────────────────

async function loadRuns() {
  const res = await fetch(`${BASE}/api/runs`, { cache: 'no-store' })
  const data = await res.json().catch(() => null)
  if (!data) return
  renderRuns(data.runs ?? [])
}

function renderRuns(runs) {
  const c = state.copy.ui
  const ul = $('runs')
  ul.replaceChildren()
  if (runs.length === 0) {
    const li = document.createElement('li')
    li.className = 'elements-note'
    li.textContent = c.evidenceEmpty
    ul.append(li)
    return
  }

  for (const run of runs.slice(0, 12)) {
    const li = document.createElement('li')
    li.className = 'run'

    const mark = document.createElement('span')
    mark.className = `run-mark ${run.passed ? 'run-mark--ok' : 'run-mark--fail'}`
    mark.title = run.passed ? c.statusPassed : c.statusFailed

    const copy = document.createElement('div')
    copy.className = 'run-copy'
    const name = document.createElement('div')
    name.className = 'run-name'
    name.textContent = run.flowName
    const meta = document.createElement('div')
    meta.className = 'run-meta'
    meta.textContent = `${engineLabel(run.engine)} · ${sec(run.ms)} · ${c.evidenceSteps} ${run.steps} · ${when(run.at)}`
    copy.append(name, meta)

    const links = document.createElement('div')
    links.className = 'run-links'
    links.append(link(run.runId, 'evidence.xlsx', c.evidenceXlsx), link(run.runId, 'log.txt', c.evidenceLog))
    if (run.hasVideo) links.append(link(run.runId, 'screen.mp4', c.evidenceVideo))

    li.append(mark, copy, links)
    ul.append(li)
  }
}

function link(runId, file, label) {
  const a = document.createElement('a')
  a.className = 'btn btn-sm'
  a.href = `${BASE}/api/runs/${runId}/${file}`
  a.textContent = label
  a.download = ''
  return a
}

function when(at) {
  const d = new Date(at)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 시나리오 목록 ─────────────────────────────────────────────────────────

/** 앱·웹이 섞인 시나리오. 파일 이름이 밝힌다 (flows/07-hybrid-*, 08-hybrid-*) */
const isHybrid = (flow) => /hybrid/.test(flow.id)

function renderFlows() {
  const c = state.copy.ui
  const ol = $('flows')
  ol.replaceChildren()
  for (const flow of state.flows) {
    const li = document.createElement('li')
    li.className = 'flow'
    li.dataset.flowId = flow.id

    const num = document.createElement('span')
    num.className = 'flow-num'

    const copy = document.createElement('div')
    copy.className = 'flow-copy'
    const name = document.createElement('div')
    name.className = 'flow-name'
    name.textContent = flow.name
    const tag = document.createElement('span')
    tag.className = `tag ${isHybrid(flow) ? 'tag--hybrid' : 'tag--native'}`
    tag.textContent = isHybrid(flow) ? c.hybridTag : c.nativeTag
    name.append(tag)
    const desc = document.createElement('div')
    desc.className = 'flow-desc'
    desc.textContent = flow.desc
    const last = document.createElement('div')
    last.className = 'flow-last'
    copy.append(name, desc, last)

    const actions = document.createElement('div')
    actions.className = 'flow-actions'
    const runBtn = document.createElement('button')
    runBtn.className = 'btn btn-primary'
    runBtn.textContent = c.runButton
    runBtn.onclick = () => post('/api/run', { flowId: flow.id, engine: engine(), record: recording() })

    // 세 방식을 잇달아 돌려 시간을 견준다. 이 데모의 핵심 단추다
    const cmpBtn = document.createElement('button')
    cmpBtn.className = 'btn'
    cmpBtn.textContent = c.compareButton
    cmpBtn.title = c.compareTooltip
    cmpBtn.onclick = () => post('/api/compare', { flowId: flow.id })
    actions.append(runBtn, cmpBtn)

    li.append(num, copy, actions)
    ol.append(li)
  }
  renderFlowLast()
  syncRunning()
}

/**
 * 시나리오 줄마다 **지금 고른 방식으로 마지막에 통과한 시간**을 한 줄 적는다.
 * 방식을 바꾸면 그 줄이 같이 바뀐다 — 고른 것이 무엇인지 목록에서도 보이게.
 */
function renderFlowLast() {
  const e = engine()
  for (const li of document.querySelectorAll('.flow')) {
    const hit = [...state.timings].reverse().find((t) => t.flowId === li.dataset.flowId && t.engine === e && t.passed)
    li.querySelector('.flow-last').textContent = hit ? `${engineLabel(e)} · ${sec(hit.ms)}` : ''
  }
}

document.querySelectorAll('input[name="engine"]').forEach((r) => {
  r.addEventListener('change', renderFlowLast)
})

// ── 세 방식 비교 표 ────────────────────────────────────────────────────────

/** 표의 열 순서. 서버의 ENGINES 와 뜻은 같지만 여기는 **보여 주는 순서**다 */
const COLUMNS = ['appium', 'maestro', 'adb']

function renderTimings() {
  const c = state.copy.ui
  const body = $('timings-body')
  const foot = $('timings-foot')
  body.replaceChildren()
  foot.replaceChildren()
  foot.hidden = true

  // 시나리오별로 **방식마다 마지막 성공**만 남긴다. 표가 견주는 표이지 기록장이 아니다
  const byFlow = new Map()
  for (const t of state.timings) {
    if (!t.passed) continue
    const row = byFlow.get(t.flowId) ?? { name: t.name }
    row[t.engine] = t.ms
    row.name = t.name
    byFlow.set(t.flowId, row)
  }

  if (byFlow.size === 0) {
    const tr = document.createElement('tr')
    tr.className = 'empty'
    const td = document.createElement('td')
    td.colSpan = COLUMNS.length + 2
    td.textContent = c.timingEmpty
    tr.append(td)
    body.append(tr)
    return
  }

  const totals = { appium: 0, maestro: 0, adb: 0 }
  const counts = { appium: 0, maestro: 0, adb: 0 }

  for (const row of byFlow.values()) {
    const tr = document.createElement('tr')
    const known = COLUMNS.filter((e) => row[e] != null)
    const fastest = known.length > 1 ? known.reduce((a, b) => (row[a] <= row[b] ? a : b)) : null
    const slowest = known.length > 0 ? known.reduce((a, b) => (row[a] >= row[b] ? a : b)) : null
    const max = slowest ? row[slowest] : 1

    const name = document.createElement('td')
    name.className = 'name'
    name.textContent = row.name
    tr.append(name)

    for (const e of COLUMNS) {
      const td = document.createElement('td')
      td.className = 'cell'
      // 폰에서는 표가 카드로 풀리고 머리글이 없어진다 — 칸마다 방식 이름을 들고 있는다
      td.dataset.label = engineLabel(e)
      // 숫자 밑에 막대 — 같은 줄 안에서 상대 길이다. 숫자만 나란히 두면 어느 쪽이
      // 얼마나 이겼는지 매번 세어야 한다
      td.append(timingCell(row[e], max, e === fastest))
      tr.append(td)
      if (row[e] != null) {
        totals[e] += row[e]
        counts[e] += 1
      }
    }

    const verdict = document.createElement('td')
    verdict.className = 'verdict'
    verdict.dataset.label = c.fastestLabel
    if (fastest) {
      const b = document.createElement('b')
      b.textContent = engineLabel(fastest)
      verdict.append(b, ` · ${(row[slowest] / Math.max(1, row[fastest])).toFixed(1)}${c.timesLabel}`)
    } else {
      verdict.textContent = '—'
    }
    tr.append(verdict)
    body.append(tr)
  }

  // 두 줄 이상이면 합계를 단다. **세 방식 모두 잰 시나리오만** 더한다 — 한쪽만 잰
  // 시나리오를 섞으면 합계가 견주기가 아니라 잰 횟수가 된다
  const complete = [...byFlow.values()].filter((r) => COLUMNS.every((e) => r[e] != null))
  if (complete.length >= 2) {
    const sum = { appium: 0, maestro: 0, adb: 0 }
    for (const r of complete) for (const e of COLUMNS) sum[e] += r[e]
    const fastest = COLUMNS.reduce((a, b) => (sum[a] <= sum[b] ? a : b))
    const slowest = COLUMNS.reduce((a, b) => (sum[a] >= sum[b] ? a : b))
    const tr = document.createElement('tr')
    const name = document.createElement('td')
    name.className = 'name'
    name.textContent = `${c.totalLabel} · ${complete.length}`
    tr.append(name)
    for (const e of COLUMNS) {
      const td = document.createElement('td')
      td.className = 'cell'
      td.dataset.label = engineLabel(e)
      td.append(timingCell(sum[e], sum[slowest], e === fastest))
      tr.append(td)
    }
    const verdict = document.createElement('td')
    verdict.className = 'verdict'
    verdict.dataset.label = c.fastestLabel
    const b = document.createElement('b')
    b.textContent = engineLabel(fastest)
    verdict.append(b, ` · ${(sum[slowest] / Math.max(1, sum[fastest])).toFixed(1)}${c.timesLabel}`)
    tr.append(verdict)
    foot.append(tr)
    foot.hidden = false
  }
}

function timingCell(ms, max, win) {
  const wrap = document.createElement('div')
  wrap.className = `tcell${win ? ' win' : ''}${ms == null ? ' none' : ''}`
  const t = document.createElement('span')
  t.className = 't'
  t.textContent = ms == null ? '—' : sec(ms)
  const bar = document.createElement('span')
  bar.className = 'bar'
  const fill = document.createElement('i')
  fill.style.setProperty('--w', ms == null ? '0%' : `${Math.max(4, Math.round((ms / Math.max(1, max)) * 100))}%`)
  bar.append(fill)
  wrap.append(t, bar)
  return wrap
}

const sec = (ms) => `${(ms / 1000).toFixed(1)}초`

// ── 웹소켓 ────────────────────────────────────────────────────────────────

let ws = null
let retry = 0

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${proto}//${location.host}${BASE}/ws`)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    retry = 0
    send({ t: 'hello', video: h264.wanted() ? 'h264' : 'jpeg' })
  }

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') {
      const u8 = new Uint8Array(ev.data)
      // 'H' + 플래그 한 바이트로 시작하면 영상 조각, 아니면 JPEG 한 장(FF D8)
      if (u8.length > 2 && u8[0] === 0x48 && u8[1] < 8) h264.receive(u8)
      else showFrame(new Blob([ev.data], { type: 'image/jpeg' }))
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

// ── 영상 — H.264 를 WebCodecs 로 푼다 ──────────────────────────────────────
// 서버(stream.ts)가 scrcpy 의 패킷을 그대로 흘려 준다: [ 'H', 플래그, 본문 ].
//   플래그 4 = 세션(폭·높이 4B 씩) · 1 = 설정(SPS/PPS, Annex-B) · 2 = 키프레임 · 0 = 델타
// WebCodecs 에는 avcC 로 설명하고 조각은 길이 접두사(AVCC)로 바꿔 넣는다 — 크롬은 Annex-B
// 도 받지만 사파리는 avcC 여야 한다. 못 풀겠으면 서버에 말하고 JPEG 으로 돌아선다.

const h264 = {
  ok: typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined',
  decoder: null,
  canvas: $('video'),
  ctx: null,
  size: null,
  sawKey: false,
  ts: 0,
  frames: 0,
  gaveUp: false,

  wanted() {
    return this.ok && !this.gaveUp
  },

  receive(u8) {
    if (!this.wanted()) return
    const flags = u8[1]
    const body = u8.subarray(2)
    if (flags & 4) {
      const dv = new DataView(body.buffer, body.byteOffset, body.byteLength)
      this.size = { width: dv.getInt32(0), height: dv.getInt32(4) }
      this.canvas.width = this.size.width
      this.canvas.height = this.size.height
      this.reset()
      return
    }
    if (flags & 1) {
      void this.configure(body)
      return
    }
    if (!this.decoder || this.decoder.state !== 'configured') return
    const key = (flags & 2) !== 0
    // 델타부터 오면 풀 수 없다 — 키프레임을 기다린다
    if (!this.sawKey && !key) return
    this.sawKey = true
    try {
      this.decoder.decode(
        new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: this.ts++ * 1000, data: toAvcc(body) }),
      )
    } catch (e) {
      this.fail(e)
    }
  },

  reset() {
    if (this.decoder) {
      try {
        this.decoder.close()
      } catch {}
    }
    this.decoder = null
    this.sawKey = false
  },

  async configure(annexB) {
    const nals = splitNals(annexB)
    const sps = nals.find((n) => (n[0] & 0x1f) === 7)
    const pps = nals.find((n) => (n[0] & 0x1f) === 8)
    if (!sps || !pps) return
    const hex = (b) => b.toString(16).padStart(2, '0')
    const codec = `avc1.${hex(sps[1])}${hex(sps[2])}${hex(sps[3])}`
    const description = new Uint8Array(11 + sps.length + pps.length)
    let o = 0
    description[o++] = 1
    description[o++] = sps[1]
    description[o++] = sps[2]
    description[o++] = sps[3]
    description[o++] = 0xff // 길이 접두사 4바이트
    description[o++] = 0xe1 // SPS 하나
    description[o++] = sps.length >> 8
    description[o++] = sps.length & 0xff
    description.set(sps, o)
    o += sps.length
    description[o++] = 1 // PPS 하나
    description[o++] = pps.length >> 8
    description[o++] = pps.length & 0xff
    description.set(pps, o)

    const cfg = { codec, description, optimizeForLatency: true }
    try {
      const support = await VideoDecoder.isConfigSupported(cfg)
      if (!support.supported) throw new Error(`unsupported ${codec}`)
      this.reset()
      this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })
      this.decoder = new VideoDecoder({
        output: (frame) => this.paint(frame),
        error: (e) => this.fail(e),
      })
      this.decoder.configure(cfg)
    } catch (e) {
      this.fail(e)
    }
  },

  paint(frame) {
    try {
      this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height)
    } finally {
      frame.close()
    }
    if (this.frames === 0) $('phone').classList.add('h264')
    this.frames += 1
    setDevice(true)
  },

  /** 못 풀겠다. 서버에 말하고 JPEG 으로 돌아선다 — 이 브라우저에서는 그 뒤로 영상을 안 받는다 */
  fail(e) {
    if (this.gaveUp) return
    console.warn('h264 decode failed, falling back to jpeg', e)
    this.gaveUp = true
    this.reset()
    $('phone').classList.remove('h264')
    send({ t: 'video', mode: 'jpeg' })
  },
}

/** Annex-B 를 NAL 단위로 자른다 (00 00 01 · 00 00 00 01 둘 다) */
function splitNals(u8) {
  const out = []
  let i = 0
  let start = -1
  while (i + 2 < u8.length) {
    if (u8[i] === 0 && u8[i + 1] === 0 && (u8[i + 2] === 1 || (u8[i + 2] === 0 && u8[i + 3] === 1))) {
      const len = u8[i + 2] === 1 ? 3 : 4
      if (start >= 0) out.push(u8.subarray(start, trimZeros(u8, start, i)))
      i += len
      start = i
      continue
    }
    i += 1
  }
  if (start >= 0) out.push(u8.subarray(start))
  return out
}

/** 다음 시작 코드 앞의 0 들(trailing zero)을 뗀다 */
function trimZeros(u8, from, to) {
  let end = to
  while (end > from && u8[end - 1] === 0) end -= 1
  return end
}

/** Annex-B 조각을 4바이트 길이 접두사(AVCC)로. 설정 NAL(SPS·PPS·AUD)은 뺀다 — 설명에 이미 있다 */
function toAvcc(annexB) {
  const nals = splitNals(annexB).filter((n) => {
    const t = n[0] & 0x1f
    return t !== 7 && t !== 8 && t !== 9
  })
  let total = 0
  for (const n of nals) total += 4 + n.length
  const out = new Uint8Array(total)
  let o = 0
  for (const n of nals) {
    out[o++] = (n.length >>> 24) & 0xff
    out[o++] = (n.length >>> 16) & 0xff
    out[o++] = (n.length >>> 8) & 0xff
    out[o++] = n.length & 0xff
    out.set(n, o)
    o += n.length
  }
  return out
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
      applySize(msg.size)
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
    case 'device-changed':
      state.serial = msg.serial
      applySize(msg.size)
      appendLog(`기기를 ${msg.serial} 로 바꿨어요`, 'ok')
      void loadDevices()
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
      beginRun(msg)
      // 폰에서 AI 탭의 [바로 실행] 으로 시작했으면 결과가 있는 탭으로 데려간다.
      // 실행 탭에서 눌렀으면 이미 거기고, 기기 탭에서 보고 있었으면 그대로 둔다
      if (document.body.dataset.tab === 'ai') setTab('run')
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
      addStep(msg)
      appendLog(`${msg.index + 1}/${msg.total} ${msg.label} · ${msg.ms}ms`, msg.ok ? 'step' : 'err')
      break
    case 'run-end': {
      state.running = false
      const kind = msg.passed ? 'passed' : msg.canceled ? 'canceled' : 'failed'
      endRun(msg, kind)
      setStatus(kind)
      markFlow(msg.flowId, msg.passed ? 'passed' : 'failed')
      appendLog(`${statusText(kind)} · ${engineLabel(msg.engine)} · ${sec(msg.ms)}`, msg.passed ? 'ok' : 'err')
      state.timings.push({
        flowId: msg.flowId,
        name: msg.name,
        engine: msg.engine,
        ms: msg.ms,
        passed: msg.passed,
      })
      renderTimings()
      renderFlowLast()
      syncRunning()
      if (!msg.passed && !msg.canceled) void diagnose()
      break
    }
    case 'compare':
      appendLog(
        `${state.copy.ui.compareButton} — ${msg.results
          .map((r) => `${engineLabel(r.engine)} ${r.ms ? sec(r.ms) : state.copy.ui.statusFailed}`)
          .join(' · ')}`,
        'ok',
      )
      break
    case 'evidence':
      appendLog(`${state.copy.ui.evidenceEyebrow} — ${state.copy.ui.evidenceXlsx}${msg.artifact.hasVideo ? `·${state.copy.ui.evidenceVideo}` : ''}`, 'ok')
      void loadRuns()
      break
    case 'ping':
      break
  }
}

const engineLabel = (e) => state.copy?.ui.engines?.[e]?.name ?? e

function statusText(kind) {
  const c = state.copy.ui
  return { running: c.statusRunning, passed: c.statusPassed, failed: c.statusFailed, canceled: c.statusCanceled, idle: c.statusIdle }[kind] ?? c.statusIdle
}

// ── 실행 결과 — 단계 목록·진행 막대·걸린 시간 ─────────────────────────────
// run-start 가 판을 비우고, run-step 이 한 줄씩 채우고, run-end 가 매듭짓는다.
// 걸린 시간은 서버 시각이 아니라 **여기서 센다** — 시계가 어긋난 브라우저에서 음수가
// 뜨는 것보다 0.1초 틀리는 편이 낫고, 마지막 값은 어차피 서버가 준 ms 로 덮는다.

let elapsedTimer = null

function beginRun(msg) {
  state.run = { name: msg.name, engine: msg.engine, total: msg.steps, steps: [], startedAt: Date.now(), done: false }
  $('result-title').textContent = msg.name
  $('result-engine').textContent = engineLabel(msg.engine)
  $('result-empty').hidden = true
  $('steps').replaceChildren()
  const bar = $('progress')
  bar.hidden = false
  bar.className = `progress${msg.steps ? '' : ' indeterminate'}`
  bar.firstElementChild.style.width = '0%'
  addRunningStep()
  clearInterval(elapsedTimer)
  elapsedTimer = setInterval(() => {
    if (state.run && !state.run.done) $('result-elapsed').textContent = sec(Date.now() - state.run.startedAt)
  }, 100)
  $('result-elapsed').textContent = sec(0)
  syncRunbar()
}

/** 다음 단계가 도는 동안 맨 아래에 서 있는 줄. 단계가 오면 그 줄이 그 단계가 된다 */
function addRunningStep() {
  const c = state.copy.ui
  const li = document.createElement('li')
  li.className = 'step step--run'
  li.dataset.pending = '1'
  const mark = document.createElement('span')
  mark.className = 'step-mark'
  const label = document.createElement('span')
  label.className = 'step-label'
  label.textContent = c.stepRunning
  const ms = document.createElement('span')
  ms.className = 'step-ms'
  li.append(mark, label, ms)
  const list = $('steps')
  list.append(li)
  // 목록 안에서만 구른다. 페이지를 끌어내리면 [실행] 을 누른 자리가 화면에서 사라진다
  list.scrollTop = list.scrollHeight
}

function addStep(msg) {
  if (!state.run) return
  state.run.steps.push(msg)
  const list = $('steps')
  const li = list.querySelector('[data-pending]') ?? document.createElement('li')
  delete li.dataset.pending
  li.className = `step ${msg.ok ? 'step--ok' : 'step--fail'}`
  li.replaceChildren()
  const mark = document.createElement('span')
  mark.className = 'step-mark'
  mark.textContent = msg.ok ? '✓' : '✕'
  const label = document.createElement('span')
  label.className = 'step-label'
  const idx = document.createElement('b')
  idx.textContent = String(msg.index + 1).padStart(2, '0')
  label.append(idx, msg.label)
  label.title = msg.label
  const ms = document.createElement('span')
  ms.className = 'step-ms'
  ms.textContent = `${msg.ms}ms`
  li.append(mark, label, ms)
  if (!li.isConnected) list.append(li)

  const total = msg.total || state.run.total
  if (total) {
    $('progress').className = 'progress'
    $('progress').firstElementChild.style.width = `${Math.round(((msg.index + 1) / total) * 100)}%`
  }
  // 아직 남았고 이 단계가 통과했으면 다음 줄을 세운다
  if (msg.ok && (!total || msg.index + 1 < total)) addRunningStep()
  else list.scrollTop = list.scrollHeight
  syncRunbar()
}

function endRun(msg, kind) {
  clearInterval(elapsedTimer)
  if (!state.run) return
  state.run.done = true
  $('result-elapsed').textContent = sec(msg.ms)
  // 도는 중이던 줄이 남아 있으면(중지·Maestro 실패처럼 단계 이벤트 없이 끝난 판) 그 줄을 결과로 바꾼다
  const pending = $('steps').querySelector('[data-pending]')
  if (pending) {
    if (kind === 'passed') pending.remove()
    else {
      delete pending.dataset.pending
      pending.className = `step ${kind === 'failed' ? 'step--fail' : ''}`
      pending.querySelector('.step-mark').textContent = kind === 'failed' ? '✕' : '–'
      pending.querySelector('.step-label').textContent = statusText(kind)
    }
  }
  const bar = $('progress')
  bar.className = `progress ${kind === 'passed' ? 'passed' : kind === 'failed' ? 'failed' : ''}`
  bar.firstElementChild.style.width = kind === 'passed' ? '100%' : bar.firstElementChild.style.width || '100%'
  state.run.kind = kind
  syncRunbar()
}

// ── 폰 — 바닥 탭과 실행 띠 ─────────────────────────────────────────────────
// 960px 아래에서만 뜻이 있다(넓은 화면에서는 CSS 가 둘 다 감춘다). 탭은 body 의
// data-tab 하나로 정하고, 어느 칸이 보이는지는 CSS 가 그 값을 보고 가른다.

const NARROW = matchMedia('(max-width: 960px)')

function setTab(name) {
  document.body.dataset.tab = name
  for (const b of document.querySelectorAll('.tab')) {
    const on = b.dataset.tab === name
    b.classList.toggle('is-on', on)
    b.setAttribute('aria-current', on ? 'page' : 'false')
  }
  if (NARROW.matches) document.querySelector('.work').scrollTo({ top: 0 })
}

document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => setTab(b.dataset.tab)
})

/**
 * 실행 띠 — 도는 동안과 끝난 직후에 바닥에 붙어 있는 한 줄. 어느 탭에 있든 진행이 보이고,
 * 누르면 실행 탭의 결과 판으로 간다. 넓은 화면에서는 CSS 가 감춘다.
 */
function syncRunbar() {
  const bar = $('runbar')
  const run = state.run
  if (!run) {
    bar.hidden = true
    return
  }
  const kind = run.kind ?? 'running'
  bar.hidden = false
  bar.className = `runbar ${kind}`
  const done = run.steps.length
  const count = run.total ? `${done}/${run.total}` : done ? String(done) : ''
  $('runbar-text').textContent = `${statusText(kind)} · ${run.name}${count ? ` · ${count}` : ''}`
  $('runbar-time').textContent = $('result-elapsed').textContent
}

$('runbar').onclick = () => {
  setTab('run')
  $('result-panel').scrollIntoView({ block: 'start', behavior: 'smooth' })
}

// 경과 시간이 띠에도 같이 흐르게 — 결과 판의 숫자를 그대로 베낀다
setInterval(() => {
  if (state.run && !state.run.done && !$('runbar').hidden) $('runbar-time').textContent = $('result-elapsed').textContent
}, 250)

// ── 상태 그리기 ───────────────────────────────────────────────────────────

/**
 * 폰 틀과 좌표 환산의 기준을 지금 기기 크기로 맞춘다.
 *
 * **기기마다 화면 비율이 다르다.** 에뮬레이터(720x1600)로 굳혀 두면 실기기를 볼 때
 * 그림이 늘어나고, 더 나쁜 것은 누른 자리가 어긋난다는 것이다 — 좌표를 0~1 로 보내는데
 * 그 0~1 을 재는 틀이 실제 그림과 다르기 때문이다.
 */
function applySize(size) {
  if (!size || !size.width || !size.height) return
  state.size = size
  $('phone').style.aspectRatio = `${size.width} / ${size.height}`
}

function setDevice(online) {
  const c = state.copy.ui
  state.deviceOnline = online
  $('phone').classList.toggle('live', online)
  const pill = $('device-pill')
  pill.lastElementChild.textContent = online ? c.deviceOn : c.deviceBooting
  pill.className = `pill pill--dot ${online ? 'on' : 'off'}`
}

function setViewers(n) {
  $('viewers').textContent = `${state.copy.ui.viewersLabel} ${n}`
}

/** 머리의 실행 핀과 결과 판의 상태 표시를 같이 바꾼다. 둘이 다른 말을 하면 안 된다 */
function setStatus(kind) {
  const text = statusText(kind)
  const cls = kind === 'idle' ? '' : kind
  const el = $('result-status')
  el.textContent = text
  el.className = `status ${cls}`
  const pill = $('run-status')
  pill.textContent = text
  pill.className = `pill pill--status ${cls}`
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

/** 내가 쥐고 있나 */
function mine() {
  return state.control.kind === 'human' && state.control.viewerId === state.viewerId
}

/**
 * 내가 지금 누를 수 있나 — 쥐고 있거나, **아무도 안 쥐고 있거나.** 누르면 서버가 그 자리에서
 * 잡아 준다(2026-09-07 사용자 지시 — [조작] 을 먼저 누르지 않아도). 폰 위의 덮개와 단추
 * 상태가 전부 이 하나를 본다
 */
function canTouch() {
  return mine() || state.control.kind === 'none'
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
    badge.textContent = c.controlFree
    badge.className = 'badge free'
    lock.hidden = true
  }

  $('phone').classList.toggle('mine', mine())
  $('release').hidden = !mine()
  document.querySelectorAll('.key').forEach((b) => (b.disabled = !canTouch()))
  $('type-send').disabled = !canTouch()
  $('type-input').disabled = !canTouch()
}

function syncRunning() {
  $('stop').disabled = !state.running
  document.querySelectorAll('.flow-actions .btn').forEach((b) => (b.disabled = state.running))
  $('editor-run').disabled = state.running
  if (!state.running && $('run-status').classList.contains('running')) setStatus('idle')
}

function appendLog(line, level) {
  const el = $('log')
  const span = document.createElement('span')
  // 단계 목록의 .step 과 이름이 겹치지 않게 lv- 를 붙인다 — 겹치면 로그 줄이 단계 칸처럼 그려진다
  if (level && level !== 'info') span.className = `lv-${level}`
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
  const ratio = state.size.width / state.size.height
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
  if (!canTouch()) return
  phone.setPointerCapture(ev.pointerId)
  pressAt = Date.now()
  pressPoint = pointOf(ev)
})

phone.addEventListener('pointerup', (ev) => {
  if (!canTouch() || !pressPoint) return
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
  if (!canTouch()) return
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

$('release').onclick = () => send({ t: 'release' })
$('stop').onclick = () => post('/api/stop', {})
$('restart-app').onclick = () => post('/api/app/restart', {})

document.querySelectorAll('.key').forEach((b) => {
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
  if (!res.ok) flash(data.error ?? `${state.copy.ui.statusFailed} (${res.status})`)
  return data
}

// ── 시나리오 편집기 ──────────────────────────────────────────────────────
// 불러오거나 · 명령 단추로 쌓거나 · 화면 요소를 집어 오거나 — 셋 다 아래 yaml
// 한 칸으로 모인다. 파일로 저장하지는 않는다(공개 데모라 아무나 쌓을 수 있다).

/** 명령 단추. 값은 커서 자리에 그대로 끼워지는 yaml 조각이다 */
const COMMANDS = [
  ['앱 실행', '- launchApp:\n    clearState: true'],
  ['탭(글자)', '- tapOn: "글자"'],
  ['탭(아이디)', '- tapOn:\n    id: "아이디"'],
  ['탭(좌표)', '- tapOn:\n    point: "50%,80%"'],
  ['길게 누르기', '- longPressOn: "글자"'],
  ['글자 입력', '- inputText: "글자"'],
  ['글자 지우기', '- eraseText: 20'],
  ['보임 확인', '- assertVisible: "글자"'],
  ['안 보임 확인', '- assertNotVisible: "글자"'],
  ['스크롤', '- scroll'],
  ['쓸어넘기기', '- swipe:\n    direction: UP'],
  ['보일 때까지', '- scrollUntilVisible:\n    element:\n      text: "글자"'],
  ['뒤로', '- back'],
  ['엔터', '- pressKey: Enter'],
  ['잠깐 기다리기', '- waitForAnimationToEnd'],
]

function editorHeader() {
  return `appId: ${state.appId}\n---\n`
}

function resetEditor() {
  $('yaml').value = `${editorHeader()}- launchApp:\n    clearState: true\n`
}

function renderCommands() {
  const box = $('commands')
  box.replaceChildren()
  for (const [label, snippet] of COMMANDS) {
    const b = document.createElement('button')
    b.className = 'btn btn-sm'
    b.textContent = label
    b.title = snippet
    b.onclick = () => insertLine(snippet)
    box.append(b)
  }
}

function renderLoadOptions() {
  const sel = $('load-flow')
  sel.replaceChildren()
  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = state.copy.ui.loadPlaceholder
  sel.append(blank)
  for (const f of state.flows) {
    const o = document.createElement('option')
    o.value = f.id
    o.textContent = f.name
    sel.append(o)
  }
  sel.onchange = () => {
    const flow = state.flows.find((f) => f.id === sel.value)
    if (flow) $('yaml').value = flow.yaml
  }
}

/**
 * 커서가 있는 줄 **다음**에 끼운다. 커서 한가운데를 쪼개면 yaml 이 깨지는데,
 * 그건 단추를 누른 사람이 기대한 일이 아니다.
 */
function insertLine(snippet) {
  const ta = $('yaml')
  const value = ta.value || editorHeader()
  const caret = ta.selectionStart ?? value.length
  let end = value.indexOf('\n', caret)
  if (end === -1) end = value.length
  const head = value.slice(0, end)
  const tail = value.slice(end)
  const next = `${head}\n${snippet}${tail}`
  ta.value = next
  const pos = head.length + 1 + snippet.length
  ta.focus()
  ta.setSelectionRange(pos, pos)
}

async function loadElements() {
  const c = state.copy.ui
  const list = $('elements')
  list.replaceChildren(li(c.elementsLoading))
  const res = await fetch(`${BASE}/api/screen/elements`, { cache: 'no-store' })
  const data = await res.json().catch(() => ({ texts: [], ids: [] }))
  list.replaceChildren()
  const rows = [
    ...(data.texts ?? []).map((v) => ({ kind: 'text', value: v })),
    ...(data.ids ?? []).map((v) => ({ kind: 'id', value: v })),
  ]
  if (rows.length === 0) {
    list.append(li(c.elementsEmpty))
    return
  }
  for (const row of rows) {
    const el = document.createElement('li')
    const code = document.createElement('code')
    code.textContent = row.kind === 'id' ? `id: ${row.value}` : row.value
    const tap = document.createElement('button')
    tap.className = 'btn btn-sm'
    tap.textContent = c.elementsTap
    tap.onclick = () =>
      insertLine(row.kind === 'id' ? `- tapOn:\n    id: "${row.value}"` : `- tapOn: "${row.value}"`)
    el.append(code, tap)
    if (row.kind === 'text') {
      const check = document.createElement('button')
      check.className = 'btn btn-sm'
      check.textContent = c.elementsCheck
      check.onclick = () => insertLine(`- assertVisible: "${row.value}"`)
      el.append(check)
    }
    list.append(el)
  }
}

function li(text) {
  const el = document.createElement('li')
  el.className = 'elements-note'
  el.textContent = text
  return el
}

$('elements-refresh').onclick = () => void loadElements()
$('editor-clear').onclick = resetEditor
$('editor-run').onclick = () => {
  const yaml = $('yaml').value
  if (!yaml.includes('appId:')) {
    flash(state.copy.ui.invalidYaml)
    return
  }
  post('/api/run-adhoc', { name: state.copy.ui.editorTitle, yaml, engine: engine(), record: recording() })
}

// ── AI 와 시나리오 짜기 ──────────────────────────────────────────────────
// 예전에는 입력칸 하나에 시킬 일을 적으면 yaml 이 나오는 자리였다. 그런데 "검색을 보고
// 싶다" 는 말 하나에는 *무엇으로 검색하나 · 결과만 보나 상세까지 들어가나* 가 빠져
// 있고, 그 빈칸을 모델이 혼자 메우면 사람이 원한 것과 다른 시나리오가 그럴듯하게
// 나온다. 되물으면 그 빈칸이 **선택지로 화면에 보인다.**
//
// **대화는 여기에만 있다.** 서버는 매번 받은 것만 보고 답한다 — 공개 데모라 사람마다
// 세션을 쥐고 있으면 그걸 언제 버릴지를 정해야 하고, 그 규칙이 곧 다음에 새는 자리다.

const chat = { turns: [], busy: false }

/** 첫 인사. [처음부터] 도 여기로 돌아온다 */
function greet() {
  const c = state.copy.ui
  chat.turns = [{ role: 'assistant', text: c.chatGreeting, choices: state.llm ? c.chatStarters ?? [] : [] }]
  chat.busy = false
  renderChat()
}

function renderChat() {
  const box = $('chat')
  box.replaceChildren(...chat.turns.map(bubble))
  if (chat.busy) box.append(typingBubble())
  box.scrollTop = box.scrollHeight
  renderChoices()
}

function bubble(turn) {
  const el = document.createElement('div')
  el.className = turn.role === 'user' ? 'msg msg--me' : 'msg msg--ai'
  const p = document.createElement('p')
  // **모델이 준 글을 HTML 로 해석하지 않는다.** 여기 오는 말은 밖에서 온 글자다
  p.textContent = turn.text
  el.append(p)
  if (turn.note) {
    const note = document.createElement('p')
    note.className = 'msg-note'
    note.textContent = turn.note
    el.append(note)
  }
  if (turn.yaml) el.append(flowCard(turn.yaml))
  return el
}

/** 만들어진 시나리오. 여기서 바로 돌리거나 편집기로 넘긴다 */
function flowCard(yaml) {
  const c = state.copy.ui
  const card = document.createElement('div')
  card.className = 'chat-flow'
  const pre = document.createElement('pre')
  pre.textContent = yaml
  const row = document.createElement('div')
  row.className = 'row'

  const run = document.createElement('button')
  run.className = 'btn btn-primary btn-sm'
  run.textContent = c.chatRun
  run.onclick = () => {
    // 돌린 것을 편집기에도 넣어 둔다. 실패했을 때 사람이 손대는 자리가 거기다
    $('yaml').value = yaml
    post('/api/run-adhoc', { name: c.chatFlowName, yaml, engine: engine(), record: recording() })
  }

  const open = document.createElement('button')
  open.className = 'btn btn-sm'
  open.textContent = c.chatOpenEditor
  open.onclick = () => {
    $('yaml').value = yaml
    $('editor-panel').open = true
    setTab('run')
    $('editor-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  row.append(run, open)
  card.append(pre, row)
  return card
}

/**
 * AI 가 준 보기. **마지막 말 아래에만 둔다** — 지나간 물음의 보기가 남아 있으면
 * 그걸 눌렀을 때 무엇에 답한 것인지 사람도 모델도 알 수 없다.
 */
function renderChoices() {
  const box = $('chat-choices')
  box.replaceChildren()
  const last = chat.turns[chat.turns.length - 1]
  if (chat.busy || !last || last.role !== 'assistant') return
  for (const label of last.choices ?? []) {
    const b = document.createElement('button')
    b.className = 'btn btn-sm choice'
    b.textContent = label
    b.onclick = () => void sendChat(label)
    box.append(b)
  }
}

function typingBubble() {
  const el = document.createElement('div')
  el.className = 'msg msg--ai'
  const p = document.createElement('p')
  p.className = 'typing'
  p.setAttribute('aria-label', state.copy.ui.chatThinking)
  for (let i = 0; i < 3; i += 1) p.append(document.createElement('i'))
  el.append(p)
  return el
}

async function sendChat(text) {
  const value = String(text ?? '').trim()
  if (!value || chat.busy || !state.llm) return
  chat.turns.push({ role: 'user', text: value })
  chat.busy = true
  $('chat-send').disabled = true
  $('chat-input').value = ''
  renderChat()

  // **시나리오는 마지막 한 벌만 같이 보낸다.** 고칠 때 필요한 건 지금 만들어 둔 것이고,
  // 지나간 판까지 실어 보내면 대화가 길어질수록 그만큼 값이 든다
  const payload = chat.turns.map((t) => ({ role: t.role, text: t.text }))
  let lastFlow = -1
  chat.turns.forEach((t, i) => {
    if (t.yaml) lastFlow = i
  })
  if (lastFlow >= 0) payload[lastFlow].yaml = chat.turns[lastFlow].yaml

  const data = await post('/api/ai/chat', { messages: payload })
  chat.busy = false
  $('chat-send').disabled = false
  if (data.ok) {
    chat.turns.push({
      role: 'assistant',
      text: data.say,
      choices: data.choices ?? [],
      yaml: data.yaml ?? null,
      note: data.note ?? null,
    })
  } else {
    chat.turns.push({ role: 'assistant', text: data.error ?? state.copy.ui.chatError, choices: [] })
  }
  renderChat()
}

$('chat-send').onclick = () => void sendChat($('chat-input').value)
$('chat-input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') void sendChat($('chat-input').value)
})
$('chat-reset').onclick = greet

// ── 실패 원인 ─────────────────────────────────────────────────────────────

async function diagnose() {
  const c = state.copy.ui
  const panel = $('diagnose-panel')
  panel.hidden = false
  $('diagnose-state').textContent = c.diagnoseThinking
  $('diagnose').textContent = ''
  const data = await post('/api/ai/diagnose', {})
  $('diagnose-state').textContent = ''
  if (!data.ok) {
    $('diagnose').textContent = data.error ?? c.diagnoseError
    return
  }
  // **모델이 준 글을 HTML 로 해석하지 않는다.** `**굵게**` 와 `` `코드` `` 둘만 우리가 바꿔 준다 —
  // 원인 요약에는 명령 이름(inputText·tapOn)이 자주 섞이는데, 본문과 같은 글꼴이면 안 읽힌다
  const frag = document.createDocumentFragment()
  for (const chunk of data.text.split(/(\*\*[^*]+\*\*|`[^`\n]+`)/)) {
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      const b = document.createElement('strong')
      b.textContent = chunk.slice(2, -2)
      frag.append(b)
    } else if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      const code = document.createElement('code')
      code.textContent = chunk.slice(1, -1)
      frag.append(code)
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
  // 폰의 첫 화면은 기기다 — 폰이 브라우저 안에서 살아 움직이는 것이 이 데모의 첫인상이다
  setTab('device')
  setStatus('idle')
  syncControl()
  connect()
  void loadElements()
  void loadRuns()
  // 기기가 붙거나 빠지는 것은 화면이 알 길이 없다. 가끔 되물어 본다
  setInterval(() => void loadDevices(), 15_000)
})()
