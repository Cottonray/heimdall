// Appium(UiAutomator2) 를 부르는 얇은 WebDriver 클라이언트.
//
// **npm 패키지를 우리 서버에 들이지 않는다.** Appium 은 이미지 안에서 도는 서버이고,
// 우리는 그 서버에 HTTP(W3C WebDriver)로 말한다 — 내장 fetch 하나면 끝난다. 이 스택의
// 전제(node_modules 0)를 지키면서도 진짜 Appium 을 쓰는 유일한 길이다.
//
// **왜 세 번째 갈래인가.** Maestro 는 시나리오 러너, adb 는 맨손, Appium 은 업계에서
// 제일 많이 쓰는 드라이버다. 셋의 값이 다르고 그 차이가 이 데모가 보여 주려는 것이다:
// Appium 은 세션 하나를 여는 데만 기기에 서버 apk 를 올리고 붙는 시간이 든다. 대신
// 한 번 열면 요소 찾기가 빠르다(우리 adb 갈래의 `uiautomator dump` 2.1초와 견줘 볼 것).

const BASE = process.env.AIQA_APPIUM_URL ?? 'http://127.0.0.1:4723'
const SERIAL = process.env.AIQA_SERIAL ?? 'emulator-5554'

export class AppiumError extends Error {}

type Json = Record<string, unknown>

async function call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Json, timeoutMs = 60_000) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let parsed: { value?: unknown } = {}
    try {
        parsed = JSON.parse(text) as { value?: unknown }
    } catch {
        throw new AppiumError(`Appium 이 JSON 이 아닌 답을 줬어요: ${text.slice(0, 200)}`)
    }
    if (!res.ok) {
        // W3C 오류는 value.error / value.message 에 들어온다
        const v = (parsed.value ?? {}) as { error?: string; message?: string }
        throw new AppiumError(`${v.error ?? res.status}: ${(v.message ?? text).split('\n')[0].slice(0, 200)}`)
    }
    return parsed.value
}

/** Appium 서버가 떠 있나. 화면이 "Appium 준비 중"을 밝히는 데 쓴다 */
export async function ready(): Promise<boolean> {
    try {
        await call('GET', '/status', undefined, 3_000)
        return true
    } catch {
        return false
    }
}

// ── 세션 ─────────────────────────────────────────────────────────────────────

/**
 * 세션 하나를 연다.
 *
 * **앱을 지정하지 않는다** (`appPackage`/`appActivity` 없이). 지정하면 세션을 여는 김에
 * 앱을 띄우는데, 그러면 시나리오의 첫 `launchApp` 이 하는 일과 겹쳐서 어느 쪽 시간인지
 * 흐려진다. 여는 것은 시나리오가 한다.
 */
export async function open(): Promise<string> {
    const value = (await call(
        'POST',
        '/session',
        {
            capabilities: {
                alwaysMatch: {
                    platformName: 'Android',
                    'appium:automationName': 'UiAutomator2',
                    'appium:udid': SERIAL,
                    // 기기 상태를 건드리지 않는다. 지우는 것은 시나리오의 clearState 몫이다
                    'appium:noReset': true,
                    // 사람이 화면을 보다가 세션이 살아 있는 채로 끊기는 일이 없게 넉넉히
                    'appium:newCommandTimeout': 120,
                    // 애니메이션은 이미 기기 설정으로 꺼 뒀다. 여기서도 못박아 둔다
                    'appium:disableWindowAnimation': true,
                    // 에뮬레이터라 hidden API 정책 경고가 뜨는 판이 있다
                    'appium:ignoreHiddenApiPolicyError': true,
                },
                firstMatch: [{}],
            },
        },
        180_000,
    )) as { sessionId?: string } | null
    const id = value?.sessionId
    if (!id) throw new AppiumError('세션을 열지 못했어요')
    return id
}

export async function close(sessionId: string) {
    try {
        await call('DELETE', `/session/${sessionId}`, undefined, 20_000)
    } catch {
        // 닫다가 실패해도 다음 세션이 새로 열린다. 여기서 시나리오를 실패로 만들지 않는다
    }
}

// ── 요소 찾기 ────────────────────────────────────────────────────────────────

/** W3C 는 요소를 이 긴 키로 돌려준다 */
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf'

function elementId(value: unknown): string | null {
    const v = value as Record<string, string> | null
    return v?.[ELEMENT_KEY] ?? v?.ELEMENT ?? null
}

/** UiSelector 표현식 안에 들어갈 자바 문자열 리터럴로 만든다 */
function javaString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function findBy(sessionId: string, using: string, value: string): Promise<string | null> {
    try {
        return elementId(await call('POST', `/session/${sessionId}/element`, { using, value }, 30_000))
    } catch {
        return null
    }
}

/**
 * **Maestro·adb 갈래와 같은 규칙으로 고른다** — 글자가 똑같거나, 정규식으로 통째로 맞거나.
 * 셋이 다른 규칙을 쓰면 견주는 것이 엔진이 아니라 우리가 만든 차이가 된다.
 *
 * UiSelector 는 OR 를 못 만든다. 그래서 값싼 것부터 차례로 본다 —
 * 대부분은 첫 번째(text 완전 일치)에서 끝난다.
 */
export async function findText(sessionId: string, needle: string): Promise<string | null> {
    const lit = javaString(needle)
    const full = javaString(`^(?:${needle})$`)
    const tries = [
        `new UiSelector().text("${lit}")`,
        `new UiSelector().description("${lit}")`,
        `new UiSelector().textMatches("${full}")`,
        `new UiSelector().descriptionMatches("${full}")`,
    ]
    for (const expr of tries) {
        const id = await findBy(sessionId, '-android uiautomator', expr)
        if (id) return id
    }
    return null
}

export async function findId(sessionId: string, id: string): Promise<string | null> {
    const lit = javaString(id)
    // Compose 의 testTag 는 패키지 접두사 없이 resource-id 로 나온다. 접두사가 붙는
    // 보통의 안드로이드 뷰도 받도록 뒤쪽 일치를 하나 더 둔다
    return (
        (await findBy(sessionId, '-android uiautomator', `new UiSelector().resourceId("${lit}")`)) ??
        (await findBy(sessionId, '-android uiautomator', `new UiSelector().resourceIdMatches(".*${lit}$")`))
    )
}

// ── 조작 ─────────────────────────────────────────────────────────────────────

export async function click(sessionId: string, element: string) {
    await call('POST', `/session/${sessionId}/element/${element}/click`, {}, 30_000)
}

export async function longClick(sessionId: string, element: string) {
    await script(sessionId, 'mobile: longClickGesture', { elementId: element, duration: 600 })
}

export async function clickPoint(sessionId: string, x: number, y: number) {
    await script(sessionId, 'mobile: clickGesture', { x: Math.round(x), y: Math.round(y) })
}

/**
 * 지금 포커스가 있는 칸에 글자를 넣는다.
 *
 * UiAutomator2 는 `ACTION_SET_TEXT` 로 넣는다 — **한글이 그대로 들어간다.** adb 갈래가
 * 키보드 apk 를 따로 심어야 했던 것과 대비되는 자리다(그쪽은 키 이벤트로 바뀌면서 한글이
 * 사라진다).
 */
export async function typeActive(sessionId: string, text: string) {
    const active = elementId(await call('GET', `/session/${sessionId}/element/active`, undefined, 20_000))
    if (!active) throw new AppiumError('글자를 넣을 칸이 없어요 (먼저 눌러야 해요)')
    await call('POST', `/session/${sessionId}/element/${active}/value`, { text }, 30_000)
}

export async function clearActive(sessionId: string) {
    const active = elementId(await call('GET', `/session/${sessionId}/element/active`, undefined, 20_000))
    if (!active) return
    await call('POST', `/session/${sessionId}/element/${active}/clear`, {}, 30_000)
}

export async function back(sessionId: string) {
    await call('POST', `/session/${sessionId}/back`, {}, 20_000)
}

/** 키코드는 안드로이드 값 그대로 (66=엔터, 67=지우기, 4=뒤로, 3=홈) */
export async function pressKeyCode(sessionId: string, keycode: number) {
    await script(sessionId, 'mobile: pressKey', { keycode })
}

export async function swipe(sessionId: string, direction: 'up' | 'down' | 'left' | 'right', size: {
    width: number
    height: number
}) {
    await script(sessionId, 'mobile: swipeGesture', {
        left: Math.round(size.width * 0.1),
        top: Math.round(size.height * 0.25),
        width: Math.round(size.width * 0.8),
        height: Math.round(size.height * 0.5),
        direction,
        percent: 0.75,
    })
}

/** 보일 때까지 굴린다. UiScrollable 이 그 일을 한 번에 해 준다 */
export async function scrollIntoView(sessionId: string, needle: string): Promise<boolean> {
    const lit = javaString(needle)
    const expr =
        `new UiScrollable(new UiSelector().scrollable(true).instance(0))` +
        `.scrollIntoView(new UiSelector().text("${lit}"))`
    return (await findBy(sessionId, '-android uiautomator', expr)) !== null
}

export async function launch(sessionId: string, appId: string, clearState: boolean) {
    await script(sessionId, 'mobile: terminateApp', { appId })
    if (clearState) await script(sessionId, 'mobile: clearApp', { appId })
    await script(sessionId, 'mobile: activateApp', { appId })
}

async function script(sessionId: string, name: string, args: Json) {
    return call('POST', `/session/${sessionId}/execute/sync`, { script: name, args: [args] }, 60_000)
}
