// 시나리오를 돌리는 자리 — **갈래가 셋이고, 셋이 같은 파일을 본다.**
//
// | 갈래 | 무엇 | 왜 견주나 |
// |---|---|---|
// | `maestro` | Maestro CLI 에 yaml 파일을 그대로 넘긴다 | 사람이 터미널에서 하는 것과 같은 실행. 재시도·대기·요소 찾기를 다 해 준다 |
// | `appium` | Appium(UiAutomator2) 서버에 WebDriver 로 말한다 | 업계에서 제일 많이 쓰는 드라이버. 세션 하나를 여는 값이 앞에 붙는다 |
// | `adb` | 우리가 단계를 읽어 adb 로 직접 친다 | JVM 도, 기기에 드라이버 apk 를 올리는 과정도 없다 |
//
// **이 데모가 보여 주려는 것이 그 차이다.** Maestro 와 Appium 은 한 번 도는 데 준비가
// 앞에 붙는다(JVM 기동 · 기기에 드라이버 apk 설치 · 세션 열기). 대신 요소를 못 찾으면
// 스스로 기다리고 다시 본다. adb 갈래는 그 앞자리가 통째로 없지만, 기다림·재시도를 우리가
// 직접 적어야 하고 요소 하나 찾는 데 `uiautomator dump` 2.1초를 낸다.
//
// **한 번에 하나만 돈다.** 기기가 한 대라 두 실행이 겹치면 서로의 화면을 밟는다 —
// 그러면 실패가 앱 탓인지 겹친 탓인지 구분할 수 없는 로그만 남는다.

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as appium from './appium.ts'
import * as device from './device.ts'
import * as flows from './flows.ts'
import * as timingStore from './timings.ts'
import type { Timing } from './timings.ts'
import type { Flow, Selector, Step } from './flows.ts'

export type Engine = 'maestro' | 'adb' | 'appium'

const MAESTRO = process.env.AIQA_MAESTRO ?? 'maestro'
/** 시나리오 하나에 주는 시간. 넘으면 죽인다 — 매달린 실행이 기기를 잡고 있으면 데모가 멈춘다 */
const RUN_TIMEOUT_MS = Number(process.env.AIQA_RUN_TIMEOUT_MS ?? 240_000)
/** adb 갈래가 요소 하나를 기다리는 최대 시간. Maestro 기본값과 같은 자리에 맞춰 둔다 */
const FIND_TIMEOUT_MS = Number(process.env.AIQA_FIND_TIMEOUT_MS ?? 8_000)
/**
 * 직전 화면 읽기를 이만큼은 다시 써도 된다. **행동을 하면 그와 상관없이 버려진다**
 * (device.invalidateDump) — 이 값은 "가만히 있었는데도 화면이 저절로 바뀌었을까"에
 * 대한 여유일 뿐이다. 읽기 한 번이 2.1초라 이 한 줄이 시나리오를 절반으로 줄인다.
 */
const DUMP_REUSE_MS = Number(process.env.AIQA_DUMP_REUSE_MS ?? 1_500)

export type RunEvent =
    | {
          type: 'run-start'
          runId: string
          flowId: string
          name: string
          engine: Engine
          at: number
          steps: number
          /** 화면 녹화를 켠 실행인가. **켜면 기기가 느려져 시간 비교가 흔들린다** */
          record: boolean
      }
    | { type: 'run-log'; runId: string; line: string; level: 'info' | 'ok' | 'err' }
    | { type: 'run-step'; runId: string; index: number; total: number; label: string; ms: number; ok: boolean }
    | {
          type: 'run-end'
          runId: string
          flowId: string
          name: string
          engine: Engine
          passed: boolean
          ms: number
          canceled: boolean
      }
    /** 세 갈래를 잇달아 돌렸을 때의 요약. 화면의 견주기 표가 이걸 본다 */
    | {
          type: 'compare'
          flowId: string
          name: string
          results: { engine: Engine; ms: number | null }[]
          at: number
      }

type Listener = (e: RunEvent) => void
let listener: Listener = () => {}
export function onEvent(fn: Listener) {
    listener = fn
}

// ── 지금 도는 것 ──────────────────────────────────────────────────────────────

type Current = {
    runId: string
    engine: Engine
    canceled: boolean
    /** maestro 갈래에서만 채운다 */
    child: ChildProcess | null
}
let current: Current | null = null
export function busy() {
    return current !== null
}

/** 마지막 실행의 로그·시나리오. 실패 원인을 물을 때 근거로 쓴다 */
let lastLog: string[] = []
let lastFlow: Flow | null = null
let lastPassed: boolean | null = null
let lastEngine: Engine | null = null

/** 갈래별 걸린 시간. 화면이 이 표로 둘을 견준다 */
export type { Timing } from './timings.ts'
const history: Timing[] = []

/**
 * 걸린 시간은 **DB(aiqa-db)에도 남긴다** (2026-09-07 파일로 시작, 2026-09-30 Postgres 로).
 * 메모리에만 두면 컨테이너를 갈아끼울 때마다 비교 표가 통째로 비고, 그 표가 이 데모의 요점이라
 * 배포 직후 열어 본 사람은 빈 화면을 본다. 읽기·쓰기와 옛 timings.json 옮기기는 timings.ts 에 있다.
 */
void timingStore.load().then((saved) => {
    history.unshift(...saved)
    if (history.length > timingStore.KEEP) history.splice(0, history.length - timingStore.KEEP)
})

export function timings() {
    // 시나리오 여덟 × 갈래 셋이면 한 바퀴가 24건이다. 40 으로 잘라 두면 한 바퀴를
    // 다 돌린 직후에도 맨 앞 몇 건이 이미 잘려 나가 표에 빈칸이 생긴다
    return history.slice(-120)
}

export function lastRun() {
    return { log: lastLog, flow: lastFlow, passed: lastPassed, engine: lastEngine }
}

function log(line: string, level: 'info' | 'ok' | 'err' = 'info') {
    if (!current) return
    if (lastLog.length < 2000) lastLog.push(line)
    listener({ type: 'run-log', runId: current.runId, line, level })
}

// ── 밖에서 부르는 자리 ────────────────────────────────────────────────────────

export async function run(
    flowId: string,
    engine: Engine,
    record = false,
): Promise<{ ok: boolean; error?: string; runId?: string }> {
    const flow = await flows.get(flowId)
    if (!flow) return { ok: false, error: '없는 시나리오예요' }
    return begin(flow, engine, record)
}

/**
 * 화면에서 만든(또는 LLM 이 옮긴) yaml 을 그 자리에서 돌린다. **파일로 남기지 않는다** —
 * 남기면 아무나 이 컨테이너의 flows/ 에 파일을 쌓을 수 있다.
 */
export async function runAdhoc(
    name: string,
    yaml: string,
    engine: Engine,
    record = false,
): Promise<{ ok: boolean; error?: string; runId?: string }> {
    return begin({ id: 'adhoc', name, desc: '화면에서 만든 시나리오', yaml, file: '' }, engine, record)
}

/** 견주기 순서. **맨손이 먼저다** — 다른 갈래가 기기에 드라이버를 올려 둔 상태에서
 * adb 를 재면 그 준비 시간이 adb 쪽 공짜가 되어 불공평하다 */
export const ENGINES: Engine[] = ['adb', 'appium', 'maestro']

/**
 * 같은 시나리오를 세 갈래로 잇달아 돌린다.
 */
export async function compare(flowId: string): Promise<{ ok: boolean; error?: string }> {
    const flow = await flows.get(flowId)
    if (!flow) return { ok: false, error: '없는 시나리오예요' }
    if (busy()) return { ok: false, error: '이미 다른 시나리오가 도는 중이에요' }

    void (async () => {
        const results: { engine: Engine; ms: number | null }[] = []
        for (const engine of ENGINES) {
            const r = await runToEnd(flow, engine)
            results.push({ engine, ms: r.ms })
            // 사람이 중지했으면 다음 갈래를 시작하지 않는다. 멈추라고 눌렀는데 다른
            // 갈래가 이어서 시작하면 그건 멈춘 게 아니다
            if (r.canceled) break
        }
        listener({ type: 'compare', flowId: flow.id, name: flow.name, results, at: Date.now() })
    })()
    return { ok: true }
}

/** 한 갈래를 끝까지 돌리고 걸린 시간을 돌려준다. 통과하지 못했으면 ms 는 null */
async function runToEnd(flow: Flow, engine: Engine): Promise<{ ms: number | null; canceled: boolean }> {
    const r = await begin(flow, engine)
    if (!r.ok) return { ms: null, canceled: false }
    // begin 은 시작만 시킨다. 끝날 때까지 기다린다
    while (busy()) await sleep(200)
    const last = history.at(-1)
    if (!last || last.engine !== engine) return { ms: null, canceled: false }
    return { ms: last.passed ? last.ms : null, canceled: last.canceled }
}

export function cancel(reason = '사람이 중지'): boolean {
    if (!current) return false
    current.canceled = true
    log(`— ${reason}`, 'err')
    if (current.child) {
        const child = current.child
        // SIGTERM 으로 안 죽는 판이 있다(JVM 이 기기 응답을 기다리는 중). 5초 뒤 확실히 끊는다
        child.kill('SIGTERM')
        setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL')
        }, 5_000)
    }
    return true
}

// ── 공통 시작·끝 ──────────────────────────────────────────────────────────────

async function begin(
    flow: Flow,
    engine: Engine,
    record = false,
): Promise<{ ok: boolean; error?: string; runId?: string }> {
    if (current) return { ok: false, error: '이미 다른 시나리오가 도는 중이에요' }

    // 우리가 직접 도는 갈래(adb·appium)는 **시작하기 전에** 단계를 다 읽는다. 절반쯤
    // 돌다가 "모르는 명령"으로 서는 것보다, 아예 시작하지 않고 이유를 말해 주는 편이 낫다
    let steps: Step[] = []
    if (engine !== 'maestro') {
        try {
            steps = flows.parse(flow.yaml)
        } catch (e) {
            return { ok: false, error: String(e instanceof Error ? e.message : e) }
        }
    }

    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const startedAt = Date.now()
    lastLog = []
    lastFlow = flow
    lastPassed = null
    lastEngine = engine
    current = { runId, engine, canceled: false, child: null }

    listener({
        type: 'run-start',
        runId,
        flowId: flow.id,
        name: flow.name,
        engine,
        at: startedAt,
        steps: engine === 'maestro' ? 0 : steps.length,
        record,
    })

    const finish = (passed: boolean) => {
        const canceled = current?.canceled ?? false
        const ms = Date.now() - startedAt
        lastPassed = passed && !canceled
        current = null
        const timing: Timing = { flowId: flow.id, name: flow.name, engine, ms, passed: lastPassed, canceled, at: startedAt }
        history.push(timing)
        if (history.length > timingStore.KEEP) history.splice(0, history.length - timingStore.KEEP)
        void timingStore.add(timing)
        listener({
            type: 'run-end',
            runId,
            flowId: flow.id,
            name: flow.name,
            engine,
            passed: lastPassed,
            ms,
            canceled,
        })
    }

    if (engine === 'maestro') void runMaestro(flow, runId, finish)
    else if (engine === 'appium') void runSteps(steps, flow, finish, appiumDriver())
    else void runSteps(steps, flow, finish, adbDriver())
    return { ok: true, runId }
}

// ── 갈래 1: Maestro CLI ───────────────────────────────────────────────────────

async function runMaestro(flow: Flow, runId: string, finish: (passed: boolean) => void) {
    // 즉석 시나리오는 파일이 없다. 임시로 떨어뜨렸다 지운다
    let dir: string | null = null
    let file = flow.file
    if (!file) {
        dir = await mkdtemp(path.join(tmpdir(), 'aiqa-flow-'))
        file = path.join(dir, 'flow.yaml')
        await writeFile(file, flow.yaml, 'utf8')
    }

    // **어느 기기에서 돌지 못박는다.** 안 주면 Maestro 가 붙어 있는 것 중에서 알아서
    // 고르는데, 실기기가 붙어 있는 동안에는 그게 화면이 보여 주는 기기와 다를 수 있다
    const child = spawn(MAESTRO, ['--device', device.target(), 'test', file], {
        env: {
            ...process.env,
            // 실행할 때마다 밖으로 통계를 보내지 않는다. 이 컨테이너는 데모 하나만 한다
            MAESTRO_CLI_NO_ANALYTICS: 'true',
            // 실행이 끝날 때마다 "--analyze 를 써 보라"는 열 줄짜리 안내를 띄운다.
            // 화면 로그가 그것으로 덮여서 정작 단계가 안 보인다
            MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
            // 첫 실행은 기기에 드라이버 apk 를 올리느라 오래 걸린다. 기본값으로는 자주 놓친다
            MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT ?? '120000',
            // 색 코드가 섞이면 화면 로그가 깨진다. TTY 가 아니면 대개 안 붙지만 못박아 둔다
            NO_COLOR: '1',
            TERM: 'dumb',
        },
    })
    if (current) current.child = child

    const timer = setTimeout(() => {
        if (current?.runId === runId) cancel('시간 초과')
    }, RUN_TIMEOUT_MS)

    // Maestro 는 단계를 이벤트로 주지 않고 로그 줄로만 준다. 그 줄을 단계로 되읽어서
    // **세 갈래가 같은 모양의 증적을 남기게** 한다 (recorder.ts 가 이 이벤트를 받는다).
    //   `Tap on id: search_open... COMPLETED`
    //   `Assert that "망원동" is visible... FAILED`
    let stepIndex = 0
    let stepSince = Date.now()

    const pump = (level: 'info' | 'err') => {
        // **조각마다 따로 디코딩하면 한글이 깨진다.** UTF-8 에서 한글은 3바이트인데,
        // 그 3바이트가 두 chunk 에 걸쳐 들어오면 양쪽 반쪽이 각각 U+FFFD(``)가 된다.
        // `stream: true` 를 준 TextDecoder 는 걸친 바이트를 물고 있다가 다음 조각과 잇는다.
        const decoder = new TextDecoder('utf-8')
        let rest = ''
        return (chunk: Buffer) => {
            rest += decoder.decode(chunk, { stream: true })
            const lines = rest.split('\n')
            rest = lines.pop() ?? ''
            for (const raw of lines) {
                // 커서 이동·색 지우기. Maestro 는 TTY 가 아니어도 가끔 이걸 흘린다
                const line = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '').trimEnd()
                if (!line) continue
                log(line, level)

                const done = line.trim().match(/^(.*?)\.\.\.\s*(COMPLETED|FAILED)$/)
                if (done && current) {
                    const now = Date.now()
                    listener({
                        type: 'run-step',
                        runId: current.runId,
                        index: stepIndex,
                        // Maestro 는 전체 단계 수를 미리 알려 주지 않는다. 0 은 "모른다"는 뜻
                        total: 0,
                        label: done[1].trim(),
                        ms: now - stepSince,
                        ok: done[2] === 'COMPLETED',
                    })
                    stepIndex += 1
                    stepSince = now
                }
            }
        }
    }
    child.stdout.on('data', pump('info'))
    child.stderr.on('data', pump('err'))
    child.on('error', (e) => log(`maestro 를 실행하지 못했어요: ${e}`, 'err'))
    child.on('close', (code) => {
        clearTimeout(timer)
        if (dir) void rm(dir, { recursive: true, force: true })
        finish(code === 0)
    })
}
// ── 갈래 2·3: 단계를 우리가 읽어 돌린다 ──────────────────────────────────────
//
// **한 벌의 실행기에 드라이버만 갈아 끼운다.** adb 갈래와 appium 갈래가 단계를 도는
// 방식(순서·시간 재기·중지·로그)을 두 번 적으면, 어느 날 한쪽만 고쳐져서 견주기가
// 거짓이 된다. 다른 것은 "한 단계를 어떻게 하느냐" 하나뿐이다.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Driver = {
    /** 로그 첫 줄에 찍는 이름 */
    label: string
    /** 세션 열기 같은 준비. **이 시간도 실행 시간에 들어간다** — 그게 갈래의 값이다 */
    setup(): Promise<void>
    teardown(): Promise<void>
    exec(step: Step, appId: string): Promise<void>
}

async function runSteps(steps: Step[], flow: Flow, finish: (passed: boolean) => void, driver: Driver) {
    const total = steps.length
    const appId = flows.appIdOf(flow.yaml) ?? device.APP_ID
    log(`${driver.label} — 단계 ${total}개 · 대상 ${appId}`, 'info')

    const deadline = Date.now() + RUN_TIMEOUT_MS
    let passed = true

    try {
        const t0 = Date.now()
        await driver.setup()
        const ms = Date.now() - t0
        if (ms > 200) log(`· 준비 ${ms}ms`, 'info')
    } catch (e) {
        log(`✗ 준비하지 못했어요 — ${e instanceof Error ? e.message : e}`, 'err')
        finish(false)
        return
    }

    for (let i = 0; i < steps.length; i += 1) {
        if (current?.canceled) {
            passed = false
            break
        }
        if (Date.now() > deadline) {
            log('시간 초과', 'err')
            passed = false
            break
        }
        const step = steps[i]
        const label = describe(step)
        const t0 = Date.now()
        let ok = true
        let detail = ''
        try {
            await driver.exec(step, appId)
        } catch (e) {
            ok = false
            detail = e instanceof Error ? e.message : String(e)
        }
        const ms = Date.now() - t0
        listener({ type: 'run-step', runId: current!.runId, index: i, total, label, ms, ok })
        log(`${ok ? '✓' : '✗'} ${label} (${ms}ms)${detail ? ` — ${detail}` : ''}`, ok ? 'ok' : 'err')
        if (!ok) {
            passed = false
            break
        }
    }

    await driver.teardown()
    finish(passed)
}

function describe(step: Step): string {
    switch (step.op) {
        case 'launchApp':
            return step.clearState ? 'launchApp (상태 지우고)' : 'launchApp'
        case 'tapOn':
            return `tapOn ${selText(step.by)}`
        case 'longPressOn':
            return `longPressOn ${selText(step.by)}`
        case 'inputText':
            return `inputText "${step.text}"`
        case 'eraseText':
            return `eraseText ${step.count}`
        case 'pressKey':
            return `pressKey ${step.key}`
        case 'back':
            return 'back'
        case 'scroll':
            return 'scroll'
        case 'swipe':
            return `swipe ${step.direction}`
        case 'scrollUntilVisible':
            return `scrollUntilVisible ${selText(step.by)}`
        case 'assertVisible':
            return `assertVisible ${selText(step.by)}`
        case 'assertNotVisible':
            return `assertNotVisible ${selText(step.by)}`
        case 'waitForAnimationToEnd':
            return 'waitForAnimationToEnd'
        case 'takeScreenshot':
            return `takeScreenshot ${step.name}`
    }
}

function selText(by: Selector): string {
    if (by.kind === 'point') return `(${Math.round(by.x * 100)}%,${Math.round(by.y * 100)}%)`
    return by.kind === 'id' ? `id=${by.value}` : `"${by.value}"`
}

// ── 드라이버 1: adb 로 직접 ───────────────────────────────────────────────────

function adbDriver(): Driver {
    return {
        label: 'adb 갈래',
        // 준비가 없다. **그게 이 갈래의 값이다**
        setup: async () => {},
        teardown: async () => {},
        exec: adbExec,
    }
}

async function adbExec(step: Step, appId: string) {
    switch (step.op) {
        case 'launchApp': {
            device.invalidateDump()
            await device.adb(['shell', 'am', 'force-stop', appId], 10_000)
            if (step.clearState) await device.adb(['shell', 'pm', 'clear', appId], 15_000)
            // 액티비티 이름을 시나리오에 적게 하지 않는다. monkey 로 런처 인텐트를 그대로 쏜다
            await device.adb(
                ['shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1'],
                20_000,
            )
            // 첫 화면이 그려질 때까지. 여기서 안 기다리면 다음 tapOn 이 빈 화면을 본다
            await waitForAny(8_000)
            return
        }
        case 'tapOn': {
            const p = await locate(step.by, FIND_TIMEOUT_MS)
            await device.tap(p.x, p.y)
            return
        }
        case 'longPressOn': {
            const p = await locate(step.by, FIND_TIMEOUT_MS)
            await device.longPress(p.x, p.y)
            return
        }
        case 'inputText':
            await device.typeText(step.text)
            return
        case 'eraseText':
            await device.eraseText(step.count)
            return
        case 'pressKey': {
            const map: Record<string, string> = {
                enter: 'enter',
                back: 'back',
                home: 'home',
                delete: 'del',
                backspace: 'del',
                tab: 'tab',
            }
            await device.key(map[step.key.toLowerCase()] ?? 'enter')
            return
        }
        case 'back':
            await device.key('back')
            return
        case 'scroll':
            await scrollOnce('UP')
            return
        case 'swipe':
            await scrollOnce(step.direction)
            return
        case 'scrollUntilVisible': {
            for (let i = 0; i < 12; i += 1) {
                const hit = await find(step.by, i === 0)
                if (hit) return
                await scrollOnce('UP')
                await sleep(250)
            }
            throw new Error('끝까지 내려도 안 보여요')
        }
        case 'assertVisible': {
            const hit = await waitFor(step.by, FIND_TIMEOUT_MS)
            if (!hit) throw new Error('화면에 없어요')
            return
        }
        case 'assertNotVisible': {
            // 없다는 것은 기다려서 증명할 수 없다. 애니메이션이 끝날 만큼만 두고 한 번 본다.
            // **여기서는 캐시를 쓰지 않는다** — 방금 사라졌을 수도 있는 것을 확인하는 자리다
            await sleep(500)
            if (await find(step.by, false)) throw new Error('아직 보여요')
            return
        }
        case 'waitForAnimationToEnd':
            await sleep(600)
            return
        case 'takeScreenshot':
            // 화면은 이미 웹소켓으로 계속 나가고 있다. 파일로 또 남길 이유가 없다
            return
    }
}

/** 화면 절반쯤에서 한 번 쓸어 올린다(또는 다른 방향으로) */
async function scrollOnce(direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
    const { width, height } = await device.screenSize()
    const cx = width / 2
    const cy = height / 2
    const dx = width * 0.32
    const dy = height * 0.28
    // UP = 손가락을 위로 = 화면이 아래로 내려간다 (Maestro 와 같은 뜻)
    const map = {
        UP: [cx, cy + dy, cx, cy - dy],
        DOWN: [cx, cy - dy, cx, cy + dy],
        LEFT: [cx + dx, cy, cx - dx, cy],
        RIGHT: [cx - dx, cy, cx + dx, cy],
    } as const
    const [x1, y1, x2, y2] = map[direction]
    await device.swipe(x1, y1, x2, y2, 200)
}

/** 화면에 무언가 그려질 때까지 */
async function waitForAny(timeoutMs: number) {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
        const nodes = await device.dump()
        if (nodes.some((n) => n.text.trim() || n.desc.trim())) return
        await sleep(250)
    }
}

/**
 * 화면에서 하나 찾는다.
 *
 * `useCache` 는 **직전 읽기를 재사용해도 되는 자리**에서만 참이다 — 즉 각 단계의 첫
 * 시도. 두 번째 시도부터는 "화면이 바뀌기를 기다리는 중"이라 반드시 새로 읽어야 한다.
 * (읽기 한 번이 2.1초다. 잇달아 나오는 assertVisible 이 그 값을 두 번 낼 이유는 없다)
 */
async function find(by: Selector, useCache = false) {
    if (by.kind === 'point') {
        const { width, height } = await device.screenSize()
        return { x: by.x * width, y: by.y * height }
    }
    const nodes = await device.dump(useCache ? DUMP_REUSE_MS : 0)
    const hit = nodes.find((n) => (by.kind === 'id' ? n.id === by.value : matchesText(n, by.value)))
    if (!hit) return null
    return {
        x: (hit.bounds.left + hit.bounds.right) / 2,
        y: (hit.bounds.top + hit.bounds.bottom) / 2,
    }
}

/**
 * **세 갈래가 똑같이 고른다.** 여기가 다르면 견주기가 거짓이 된다 — 한쪽만 통과하는
 * 시나리오가 생기고, 그건 엔진의 속도가 아니라 우리가 만든 차이다.
 *
 * 2026-09-04 실측으로 Maestro 의 규칙을 확인했다(같은 화면에서 셋을 돌려 봤다):
 *   `"골목"`      → 실패   (부분 일치가 아니다)
 *   `"나의 골목"`  → 통과   (글자가 그대로 같으면 된다)
 *   `".*골목.*"`  → 통과   (정규식이면 **전체가** 맞아야 한다)
 * 그래서 "글자가 똑같거나, 정규식으로 통째로 맞거나" 둘 중 하나다.
 * (appium 갈래는 같은 규칙을 UiSelector 로 옮겨 놓았다 — appium.ts 의 findText)
 */
function matchesText(node: device.UiNode, needle: string): boolean {
    if (node.text === needle || node.desc === needle) return true
    let re: RegExp
    try {
        re = new RegExp(`^(?:${needle})$`, 's')
    } catch {
        // 정규식으로 못 읽히는 글자면 위의 같음 검사가 전부다
        return false
    }
    return re.test(node.text) || re.test(node.desc)
}

async function waitFor(by: Selector, timeoutMs: number) {
    const until = Date.now() + timeoutMs
    let first = true
    for (;;) {
        const hit = await find(by, first)
        first = false
        if (hit) return hit
        if (Date.now() >= until) return null
        await sleep(250)
    }
}

async function locate(by: Selector, timeoutMs: number) {
    const hit = await waitFor(by, timeoutMs)
    if (!hit) throw new Error('화면에서 못 찾았어요')
    return hit
}

// ── 드라이버 2: Appium (UiAutomator2) ────────────────────────────────────────

function appiumDriver(): Driver {
    let session = ''
    return {
        label: 'appium 갈래',
        setup: async () => {
            // **세션 여는 값이 이 갈래의 값이다.** 기기에 UiAutomator2 서버 apk 를 올리고
            // 붙는 시간이 여기 들어간다 — 처음 한 번은 더 걸리고 그 뒤로는 짧아진다
            session = await appium.open()
        },
        teardown: async () => {
            if (session) await appium.close(session)
            session = ''
        },
        exec: (step, appId) => appiumExec(session, step, appId),
    }
}

/** appium 갈래의 요소 찾기 — 없으면 잠깐 기다렸다 다시 본다 (Maestro 와 같은 자리) */
async function appiumFind(session: string, by: Selector, timeoutMs: number): Promise<string> {
    if (by.kind === 'point') throw new Error('point 는 요소가 아니에요')
    const until = Date.now() + timeoutMs
    for (;;) {
        const id =
            by.kind === 'id' ? await appium.findId(session, by.value) : await appium.findText(session, by.value)
        if (id) return id
        if (Date.now() >= until) throw new Error('화면에서 못 찾았어요')
        await sleep(200)
    }
}

async function appiumExec(session: string, step: Step, appId: string) {
    switch (step.op) {
        case 'launchApp':
            await appium.launch(session, appId, step.clearState)
            await sleep(400)
            return
        case 'tapOn': {
            if (step.by.kind === 'point') {
                const { width, height } = await device.screenSize()
                await appium.clickPoint(session, step.by.x * width, step.by.y * height)
                return
            }
            await appium.click(session, await appiumFind(session, step.by, FIND_TIMEOUT_MS))
            return
        }
        case 'longPressOn':
            await appium.longClick(session, await appiumFind(session, step.by, FIND_TIMEOUT_MS))
            return
        case 'inputText':
            // UiAutomator2 는 ACTION_SET_TEXT 로 넣는다 — 한글이 그대로 들어간다.
            // adb 갈래가 키보드 apk 를 따로 심어야 했던 것과 대비되는 자리다
            await appium.typeActive(session, step.text)
            return
        case 'eraseText':
            await appium.clearActive(session)
            return
        case 'pressKey': {
            const codes: Record<string, number> = { enter: 66, back: 4, home: 3, delete: 67, backspace: 67, tab: 61 }
            await appium.pressKeyCode(session, codes[step.key.toLowerCase()] ?? 66)
            return
        }
        case 'back':
            await appium.back(session)
            return
        case 'scroll':
            await appium.swipe(session, 'up', await device.screenSize())
            return
        case 'swipe':
            await appium.swipe(
                session,
                step.direction.toLowerCase() as 'up' | 'down' | 'left' | 'right',
                await device.screenSize(),
            )
            return
        case 'scrollUntilVisible': {
            // UiScrollable.scrollIntoView 는 Compose 화면에서 "끝에 닿았다"고 잘못 판정한다 —
            // adb `input swipe` 로는 한 번에 보이는 줄을 3초 만에 못 찾았다고 돌려줬다 (2026-09-07
            // 실측). 그래서 adb 갈래와 같은 방식으로 **직접 굴리며 찾는다** — 보이면 그 자리에서 끝
            if (step.by.kind !== 'text' && step.by.kind !== 'id') throw new Error('글자나 아이디로만 굴릴 수 있어요')
            for (let i = 0; i < 12; i += 1) {
                try {
                    await appiumFind(session, step.by, i === 0 ? 800 : 400)
                    return
                } catch {
                    // 아직 안 보인다 — 한 번 더 굴린다
                }
                await appium.swipe(session, 'up', await device.screenSize())
            }
            throw new Error('끝까지 내려도 안 보여요')
        }
        case 'assertVisible':
            await appiumFind(session, step.by, FIND_TIMEOUT_MS)
            return
        case 'assertNotVisible': {
            await sleep(500)
            try {
                await appiumFind(session, step.by, 0)
            } catch {
                return
            }
            throw new Error('아직 보여요')
        }
        case 'waitForAnimationToEnd':
            await sleep(600)
            return
        case 'takeScreenshot':
            return
    }
}


// ── 실패했을 때 모아 두는 근거 ────────────────────────────────────────────────

export type Evidence = {
    flowName: string
    engine: Engine
    yaml: string
    log: string[]
    activity: string
    texts: string[]
}

export async function evidence(): Promise<Evidence | null> {
    if (!lastFlow || !lastEngine) return null
    const [activity, texts] = await Promise.all([device.currentActivity(), device.visibleTexts()])
    return {
        flowName: lastFlow.name,
        engine: lastEngine,
        yaml: lastFlow.yaml,
        // 앞부분은 대개 드라이버 기동 로그다. 실패는 늘 끝에 있다
        log: lastLog.slice(-80),
        activity,
        texts,
    }
}
