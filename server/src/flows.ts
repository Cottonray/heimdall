// 시나리오 파일을 읽고, **Maestro yaml 을 우리도 읽을 수 있게** 단계로 푼다.
//
// 왜 파싱까지 하나: 같은 시나리오를 두 갈래로 돌려 견주기 때문이다.
//   · `maestro` — Maestro CLI 에 파일을 그대로 넘긴다 (사람이 터미널에서 하는 것과 같다)
//   · `adb`     — 우리가 단계를 읽어 adb 로 직접 친다 (JVM·드라이버 설치가 없다)
// 두 갈래가 **같은 파일**을 본다는 것이 중요하다. 시나리오를 두 벌 적어 두면 견주는 것이
// 엔진이 아니라 시나리오가 된다.
//
// **YAML 라이브러리를 들이지 않는다.** 우리가 쓰는 문법은 아래 `parse` 가 받는 만큼이
// 전부다(리스트 하나, 한 겹 들여쓰기, 문자열·불리언 값). 범용 파서를 넣으면 이 스택의
// 전제(node_modules 0)가 그것 하나 때문에 깨진다. 모르는 명령을 만나면 조용히 넘기지 않고
// 오류로 세운다 — adb 갈래만 소리 없이 건너뛰면 두 갈래의 결과가 달라진다.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export const FLOW_DIR = process.env.AIQA_FLOW_DIR ?? path.join(import.meta.dirname, '..', '..', 'flows')

export type Flow = {
    /** 파일 이름에서 확장자를 뗀 것. 화면과 API 가 이걸로 가리킨다 */
    id: string
    /** 첫 줄 주석 `# 이름 — 설명` 에서 읽는다 */
    name: string
    desc: string
    yaml: string
    /** 파일 경로. Maestro 갈래는 이 파일을 그대로 넘긴다 */
    file: string
}

export async function list(): Promise<Flow[]> {
    let names: string[]
    try {
        names = await readdir(FLOW_DIR)
    } catch {
        return []
    }
    const flows: Flow[] = []
    for (const file of names.sort()) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue
        const full = path.join(FLOW_DIR, file)
        const yaml = await readFile(full, 'utf8')
        const id = file.replace(/\.(yaml|yml)$/, '')
        const head = yaml.split('\n', 1)[0]
        const m = head.match(/^#\s*(.+?)(?:\s+—\s+(.*))?$/)
        flows.push({ id, name: m?.[1]?.trim() || id, desc: m?.[2]?.trim() ?? '', yaml, file: full })
    }
    return flows
}

export async function get(id: string): Promise<Flow | null> {
    return (await list()).find((f) => f.id === id) ?? null
}

// ── yaml → 단계 ───────────────────────────────────────────────────────────────

export type Step =
    | { op: 'launchApp'; clearState: boolean }
    | { op: 'tapOn'; by: Selector }
    | { op: 'longPressOn'; by: Selector }
    | { op: 'inputText'; text: string }
    | { op: 'eraseText'; count: number }
    | { op: 'pressKey'; key: string }
    | { op: 'back' }
    | { op: 'scroll' }
    | { op: 'swipe'; direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' }
    | { op: 'scrollUntilVisible'; by: Selector }
    | { op: 'assertVisible'; by: Selector }
    | { op: 'assertNotVisible'; by: Selector }
    | { op: 'waitForAnimationToEnd' }
    | { op: 'takeScreenshot'; name: string }

/** 화면에서 무엇을 가리키나. 셋 중 하나다 */
export type Selector =
    | { kind: 'text'; value: string }
    | { kind: 'id'; value: string }
    | { kind: 'point'; x: number; y: number }

export class FlowParseError extends Error {}

/** `appId:` 줄에서 대상 앱을 읽는다. 없으면 null */
export function appIdOf(yaml: string): string | null {
    const m = yaml.match(/^\s*appId:\s*(\S+)\s*$/m)
    return m ? m[1].replace(/^["']|["']$/g, '') : null
}

/**
 * 우리 어휘만 받는 파서.
 *
 * 받는 모양은 둘뿐이다:
 *   - 명령                     (`- launchApp`, `- back`)
 *   - 명령: 값                 (`- tapOn: "글자"`, `- inputText: "글자"`)
 *   - 명령:                    + 한 겹 들여쓴 `키: 값` (`- tapOn:` / `    id: "..."`)
 * `element:` 처럼 한 겹 더 들어가는 것은 `scrollUntilVisible` 하나라 그 자리만 따로 본다.
 */
export function parse(yaml: string): Step[] {
    // 앞쪽 설정 블록(appId 등)을 잘라낸다. Maestro 는 --- 로 가른다
    const body = yaml.includes('\n---') ? yaml.slice(yaml.indexOf('\n---') + 4) : yaml
    const lines = body
        .split('\n')
        .map((l) => l.replace(/\t/g, '    '))
        .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))

    const steps: Step[] = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        if (!line.trim().startsWith('- ')) {
            throw new FlowParseError(`읽을 수 없는 줄이에요: ${line.trim()}`)
        }
        const baseIndent = line.length - line.trimStart().length
        const head = line.trim().slice(2).trim()

        // 뒤따르는 더 깊은 들여쓰기 줄들을 이 명령의 몫으로 모은다
        const nested: { key: string; value: string; depth: number }[] = []
        let j = i + 1
        while (j < lines.length) {
            const next = lines[j]
            const indent = next.length - next.trimStart().length
            if (indent <= baseIndent || next.trim().startsWith('- ')) break
            const m = next.trim().match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
            if (!m) throw new FlowParseError(`읽을 수 없는 줄이에요: ${next.trim()}`)
            nested.push({ key: m[1], value: unquote(m[2]), depth: indent })
            j += 1
        }
        steps.push(toStep(head, nested))
        i = j
    }
    if (steps.length === 0) throw new FlowParseError('단계가 하나도 없어요')
    return steps
}

function unquote(raw: string): string {
    const v = raw.trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        return v.slice(1, -1)
    }
    return v
}

function selectorFrom(inline: string, nested: { key: string; value: string }[]): Selector {
    if (inline) return { kind: 'text', value: inline }
    const id = nested.find((n) => n.key === 'id')
    if (id) return { kind: 'id', value: id.value }
    const text = nested.find((n) => n.key === 'text')
    if (text) return { kind: 'text', value: text.value }
    const point = nested.find((n) => n.key === 'point')
    if (point) {
        const m = point.value.match(/^\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*$/)
        if (!m) throw new FlowParseError(`point 는 "50%,80%" 꼴이어야 해요: ${point.value}`)
        return { kind: 'point', x: Number(m[1]) / 100, y: Number(m[2]) / 100 }
    }
    throw new FlowParseError('무엇을 가리키는지 없어요 (글자·id·point 중 하나가 필요해요)')
}

function toStep(head: string, nested: { key: string; value: string; depth: number }[]): Step {
    // `tapOn: "글자"` 처럼 한 줄로 끝나는 판과 `tapOn:` + 들여쓰기 판을 함께 받는다
    const colon = head.indexOf(':')
    const op = (colon === -1 ? head : head.slice(0, colon)).trim()
    const inline = colon === -1 ? '' : unquote(head.slice(colon + 1))

    switch (op) {
        case 'launchApp':
            return { op, clearState: nested.some((n) => n.key === 'clearState' && n.value === 'true') }
        case 'tapOn':
        case 'longPressOn':
        case 'assertVisible':
        case 'assertNotVisible':
            return { op, by: selectorFrom(inline, nested) }
        case 'scrollUntilVisible': {
            // element: 아래 한 겹 더 들어간다. 그 안의 text/id 만 본다
            const inner = nested.filter((n) => n.key !== 'element')
            return { op, by: selectorFrom('', inner) }
        }
        case 'inputText':
            return { op, text: inline || nested.find((n) => n.key === 'text')?.value || '' }
        case 'eraseText':
            return { op, count: Number(inline) || 30 }
        case 'pressKey':
            return { op, key: inline || 'Enter' }
        case 'back':
            return { op }
        case 'scroll':
            return { op }
        case 'swipe': {
            const dir = (nested.find((n) => n.key === 'direction')?.value ?? inline ?? 'UP').toUpperCase()
            if (dir !== 'UP' && dir !== 'DOWN' && dir !== 'LEFT' && dir !== 'RIGHT') {
                throw new FlowParseError(`swipe 방향이 이상해요: ${dir}`)
            }
            return { op, direction: dir }
        }
        case 'waitForAnimationToEnd':
            return { op }
        case 'takeScreenshot':
            return { op, name: inline || 'shot' }
        default:
            // **조용히 넘기지 않는다.** adb 갈래만 건너뛰면 두 갈래가 다른 일을 하게 된다
            throw new FlowParseError(`adb 갈래가 모르는 명령이에요: ${op}`)
    }
}

// ── 저장된 시나리오에서 뽑아 쓰는 것들 ────────────────────────────────────────
//
// AI 에게 "이 앱은 이렇게 생겼다"를 말로 적어 주지 않는다. 적어 두면 앱이 바뀔 때마다
// 프롬프트를 같이 고쳐야 하고, 대개 한쪽만 고쳐진다. 대신 **이미 통과해 본 시나리오에서
// 뽑는다** — 여기 있는 글자·아이디는 실제로 잡히는 것이 확인된 값이다.

/** 저장된 시나리오가 실제로 집는 글자와 아이디 */
export async function vocabulary(): Promise<{ texts: string[]; ids: string[] }> {
    const texts: string[] = []
    const ids: string[] = []
    for (const flow of await list()) {
        let steps: Step[]
        try {
            steps = parse(flow.yaml)
        } catch {
            // 사람이 고치다 깨뜨린 파일 하나 때문에 목록이 통째로 비지 않게 한다
            continue
        }
        for (const step of steps) {
            const by = (step as { by?: Selector }).by
            if (!by) continue
            if (by.kind === 'text' && !texts.includes(by.value)) texts.push(by.value)
            if (by.kind === 'id' && !ids.includes(by.value)) ids.push(by.value)
        }
    }
    return { texts, ids }
}

/**
 * 예시로 보여 줄 시나리오 한 벌. **주석은 뗀다** — 우리 주석은 사람에게 하는 말이라
 * 모델이 그 말투를 따라 하면 시나리오에 설명이 섞여 들어온다.
 */
export async function example(prefer = '07-hybrid-coupon'): Promise<string> {
    const all = await list()
    const pick = all.find((f) => f.id === prefer) ?? all[0]
    if (!pick) return ''
    return pick.yaml
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n')
        .trim()
}
