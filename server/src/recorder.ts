// 실행 하나가 남기는 것 — **화면 녹화**와 **증적 파일(xlsx)**.
//
// ## 시간을 흔들지 않는 것이 첫 번째 규칙이다
//
// 이 데모의 절반은 세 갈래의 걸린 시간을 견주는 것이다. 증적을 만들자고 단계마다
// `screencap` 을 새로 부르면 단계당 150ms 씩 붙어서 **그 비교가 통째로 거짓이 된다.**
//
// 그래서 스크린샷은 **새로 찍지 않는다.** 화면 스트림이 이미 220ms 마다 프레임을 만들고
// 있으므로(screen.ts), 단계가 끝날 때 그 마지막 프레임을 집어 온다. 값은 0에 가깝다.
//
// **녹화(mp4)는 다르다.** `screenrecord` 는 기기 안에서 인코더를 돌리므로 실행이 느려진다.
// 그래서 녹화는 실행마다 켜고 끄는 선택이고, 기본은 꺼짐이다. 화면과 문서가 그 사실을
// 밝힌다 — 켜 둔 채로 잰 값을 안 켠 값과 나란히 놓으면 안 된다.

/// <reference path="./exceljs.d.ts" />
import { mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import * as device from './device.ts'
import * as screen from './screen.ts'

/** 증적이 쌓이는 자리. 도커 볼륨이라 배포로 컨테이너가 새로 떠도 남는다 */
const RUNS_DIR = process.env.AIQA_RUNS_DIR ?? '/opt/aiqa/runs'
/** 남겨 둘 실행 수. 공개 데모라 무한히 쌓게 두지 않는다 */
const KEEP = Number(process.env.AIQA_RUNS_KEEP ?? 30)
/** 기기 안에서 녹화가 떨어지는 자리 */
const DEVICE_MP4 = '/sdcard/aiqa-record.mp4'

export type StepShot = {
    index: number
    label: string
    ms: number
    ok: boolean
    /** 이 단계가 끝났을 때의 화면. 없을 수도 있다(프레임이 아직 없을 때) */
    jpeg: Buffer | null
}

type Session = {
    runId: string
    flowId: string
    flowName: string
    engine: string
    serial: string
    startedAt: number
    recording: boolean
    steps: StepShot[]
    log: string[]
}

let session: Session | null = null

export function active(): boolean {
    return session !== null
}

// ── 실행 동안 ────────────────────────────────────────────────────────────────

export async function start(meta: {
    runId: string
    flowId: string
    flowName: string
    engine: string
    recording: boolean
}) {
    session = {
        ...meta,
        serial: device.target(),
        startedAt: Date.now(),
        steps: [],
        log: [],
    }
    // **보는 사람이 없어도 화면을 계속 만들게 붙잡는다.** 단계마다 집어 갈 프레임이
    // 그 루프에서 나오기 때문이다 — 안 잡아 두면 브라우저를 아무도 안 연 실행의 증적에
    // 그림이 한 장도 안 들어간다
    screen.hold()
    if (!meta.recording) return

    // 기기 안에서 돌려 두고 끝날 때 끊는다. `--time-limit` 상한이 180초라 그 값으로 못박는다
    // (우리 시나리오는 길어야 40초다). 백그라운드로 띄우고 pid 는 pkill 로 잡는다.
    await device.adb(['shell', 'rm', '-f', DEVICE_MP4], 8_000)
    void device.adb(
        ['shell', 'screenrecord', '--time-limit', '180', '--bit-rate', '4000000', DEVICE_MP4],
        200_000,
    )
    // 인코더가 실제로 물리기까지 잠깐 걸린다. 안 기다리면 첫 몇 초가 빈다
    await sleep(700)
}

export function log(line: string) {
    if (!session) return
    if (session.log.length < 3000) session.log.push(line)
}

/**
 * 단계 하나가 끝났다. **지금 화면을 새로 찍지 않고** 스트림의 마지막 프레임을 집어 온다.
 * (그 프레임을 넘겨 주는 것은 부르는 쪽 — main.ts 가 screen.lastJpeg() 를 준다)
 */
export function step(index: number, label: string, ms: number, ok: boolean, jpeg: Buffer | null) {
    if (!session) return
    session.steps.push({ index, label, ms, ok, jpeg: jpeg ? Buffer.from(jpeg) : null })
}

// ── 끝났을 때 ────────────────────────────────────────────────────────────────

export type Artifact = {
    runId: string
    flowName: string
    engine: string
    passed: boolean
    ms: number
    at: number
    steps: number
    hasVideo: boolean
}

export async function finish(result: { passed: boolean; ms: number }): Promise<Artifact | null> {
    const s = session
    session = null
    if (!s) return null
    screen.release()

    const dir = path.join(RUNS_DIR, s.runId)
    await mkdir(dir, { recursive: true })

    let hasVideo = false
    if (s.recording) hasVideo = await pullRecording(dir)

    // 스크린샷은 파일로도 남긴다 — xlsx 를 못 여는 자리에서도 볼 수 있게
    for (const step of s.steps) {
        if (!step.jpeg) continue
        await writeFile(path.join(dir, `step-${String(step.index + 1).padStart(2, '0')}.jpg`), step.jpeg)
    }

    const artifact: Artifact = {
        runId: s.runId,
        flowName: s.flowName,
        engine: s.engine,
        passed: result.passed,
        ms: result.ms,
        at: s.startedAt,
        steps: s.steps.length,
        hasVideo,
    }

    await writeFile(path.join(dir, 'run.json'), JSON.stringify({ ...artifact, serial: s.serial }, null, 2))
    await writeFile(path.join(dir, 'log.txt'), s.log.join('\n'))
    await buildWorkbook(dir, s, result, hasVideo)
    void prune()
    return artifact
}

/** 녹화를 끊고 기기에서 가져온다. 실패해도 실행 자체를 실패로 만들지 않는다 */
async function pullRecording(dir: string): Promise<boolean> {
    // SIGINT 라야 mp4 가 제대로 닫힌다. 죽여 버리면 재생할 수 없는 조각이 남는다
    await device.adb(['shell', 'pkill', '-INT', '-f', 'screenrecord'], 10_000)
    // 인코더가 파일을 닫을 시간을 준다
    await sleep(1500)
    const local = path.join(dir, 'screen.mp4')
    await device.adb(['pull', DEVICE_MP4, local], 60_000)
    await device.adb(['shell', 'rm', '-f', DEVICE_MP4], 8_000)
    // **adb 의 말이 아니라 파일을 본다.** `adb pull` 은 성공 문구를 stderr 로 내보내는 판이
    // 있어서, stdout 을 읽어 판정하면 멀쩡히 받아 온 mp4 를 "없다"고 적는다 (2026-09-04)
    try {
        const info = await stat(local)
        return info.size > 1024
    } catch {
        return false
    }
}

// ── 증적 파일 ────────────────────────────────────────────────────────────────

/**
 * 스크린샷이 셀 안에 박힌 xlsx 한 장.
 *
 * exceljs 를 **여기서만** 부른다. 실행 경로(시나리오를 도는 길)에는 들어가지 않게 해서,
 * 이 라이브러리가 없거나 깨져도 테스트 자체는 그대로 돌게 한다.
 */
async function buildWorkbook(
    dir: string,
    s: Session,
    result: { passed: boolean; ms: number },
    hasVideo: boolean,
) {
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'AI QA'
    wb.created = new Date(s.startedAt)

    // ── 요약 ──
    const sum = wb.addWorksheet('요약')
    sum.columns = [
        { header: '항목', key: 'k', width: 18 },
        { header: '값', key: 'v', width: 62 },
    ]
    const at = new Date(s.startedAt)
    const rows: [string, string][] = [
        ['시나리오', s.flowName],
        ['실행 방식', engineLabel(s.engine)],
        ['결과', result.passed ? '통과' : '실패'],
        ['걸린 시간', `${(result.ms / 1000).toFixed(1)}초`],
        ['실행 시각', at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })],
        ['기기', s.serial],
        ['단계 수', `${s.steps.length}`],
        ['화면 녹화', hasVideo ? 'screen.mp4 로 함께 저장' : '안 함'],
        ['실행 번호', s.runId],
    ]
    for (const [k, v] of rows) sum.addRow({ k, v })
    sum.getRow(1).font = { bold: true }
    sum.getColumn('k').font = { bold: true }
    // 통과/실패는 눈에 띄어야 한다 — 증적을 넘겨받는 사람이 제일 먼저 보는 칸이다
    sum.getCell('B4').font = { bold: true, color: { argb: result.passed ? 'FF1F8A53' : 'FFB8402A' } }

    // ── 단계별 화면 ──
    const sheet = wb.addWorksheet('단계별 화면')
    sheet.columns = [
        { header: '#', key: 'n', width: 5 },
        { header: '단계', key: 'label', width: 46 },
        { header: '결과', key: 'ok', width: 8 },
        { header: '걸린 시간', key: 'ms', width: 11 },
        { header: '화면', key: 'shot', width: 30 },
    ]
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    for (const step of s.steps) {
        const row = sheet.addRow({
            n: step.index + 1,
            label: step.label,
            ok: step.ok ? '통과' : '실패',
            ms: `${step.ms}ms`,
        })
        row.alignment = { vertical: 'top', wrapText: true }
        row.getCell('ok').font = { bold: true, color: { argb: step.ok ? 'FF1F8A53' : 'FFB8402A' } }
        if (!step.jpeg) continue

        // 세로로 긴 폰 화면이라 행을 키워야 그림이 안 잘린다. 폭 150px 기준으로 높이를 맞춘다
        const width = 150
        const height = Math.round((width * 1600) / 720)
        row.height = height * 0.78 // exceljs 의 행 높이는 픽셀이 아니라 포인트다
        const imageId = wb.addImage({ buffer: step.jpeg, extension: 'jpeg' })
        sheet.addImage(imageId, {
            tl: { col: 4.1, row: row.number - 1 + 0.1 },
            ext: { width, height },
        })
    }

    // ── 실행 로그 ──
    const logSheet = wb.addWorksheet('실행 로그')
    logSheet.columns = [{ header: '로그', key: 'line', width: 120 }]
    logSheet.getRow(1).font = { bold: true }
    for (const line of s.log) logSheet.addRow({ line })

    await wb.xlsx.writeFile(path.join(dir, 'evidence.xlsx'))
}

function engineLabel(engine: string): string {
    return engine === 'adb' ? 'adb 직접' : engine === 'appium' ? 'Appium' : 'Maestro CLI'
}

// ── 목록·정리 ────────────────────────────────────────────────────────────────

export async function list(): Promise<Artifact[]> {
    let names: string[]
    try {
        names = await readdir(RUNS_DIR)
    } catch {
        return []
    }
    const out: Artifact[] = []
    for (const name of names) {
        try {
            const raw = await readFile(path.join(RUNS_DIR, name, 'run.json'), 'utf8')
            out.push(JSON.parse(raw) as Artifact)
        } catch {
            // run.json 이 없으면 만들다 만 것이다. 목록에 올리지 않는다
        }
    }
    return out.sort((a, b) => b.at - a.at)
}

/** 증적 파일 하나를 읽어 준다. **경로는 runId 로만 만든다** — 밖에서 온 이름을 붙이지 않는다 */
export async function file(runId: string, which: 'evidence.xlsx' | 'screen.mp4' | 'log.txt') {
    if (!/^[a-z0-9-]+$/.test(runId)) return null
    try {
        return await readFile(path.join(RUNS_DIR, runId, which))
    } catch {
        return null
    }
}

/** 오래된 것부터 지운다. 공개 데모라 무한히 쌓게 두지 않는다 */
async function prune() {
    const all = await list()
    for (const old of all.slice(KEEP)) {
        await rm(path.join(RUNS_DIR, old.runId), { recursive: true, force: true }).catch(() => {})
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
