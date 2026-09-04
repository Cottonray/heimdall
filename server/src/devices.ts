// 붙어 있는 기기 목록과, **그중 무엇을 공개 화면에서 고를 수 있는지.**
//
// ## 왜 목록이 필요해졌나
//
// 처음에는 에뮬레이터 한 대뿐이라 목록이 필요 없었다. 실기기를 붙일 수 있게 하면서
// "지금 보는 기기"라는 개념이 생겼다 — 화면 스트림도 조작도 시나리오 실행도 그 한 대를 본다.
//
// ## 공개 화면에서 아무 기기나 고르게 두지 않는다
//
// 이 데모는 **주소를 아는 누구나 열고 조작할 수 있다.** 그 상태에서 목록에 실기기가
// 나타나고 아무나 고를 수 있으면, 모르는 사람이 **주인의 개인 폰을 원격으로 조작하게 된다.**
// 사진·메시지·계정이 그대로 열려 있는 기기다.
//
// 그래서 **고를 수 있는 것은 허용 목록에 적힌 serial 뿐이다** (`AIQA_PUBLIC_SERIALS`).
// 기본값은 에뮬레이터 하나이고, 실기기는 보여 줄 마음이 있을 때 운영자가 직접 넣는다.
// 목록에는 보이되 "비공개"로 잠겨 나가므로, 붙어 있다는 사실 자체는 화면에서 확인된다.

import * as device from './device.ts'

/**
 * 공개 화면에서 고를 수 있는 serial. 쉼표로 나눈다.
 *
 * `*` 를 넣으면 **붙어 있는 전부**가 열린다 — 개인 폰이 꽂혀 있는 동안에는 절대 쓰지 않는다.
 */
const PUBLIC = (process.env.AIQA_PUBLIC_SERIALS ?? process.env.AIQA_SERIAL ?? 'emulator-5554')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export type DeviceInfo = {
    serial: string
    /** adb 가 보는 상태. `device` 가 정상이고 `unauthorized` 는 폰에서 허용을 안 누른 것이다 */
    state: string
    kind: 'emulator' | 'real'
    model: string
    /** 공개 화면에서 고를 수 있나 */
    selectable: boolean
    /** 지금 보고 있는 기기인가 */
    current: boolean
}

function selectable(serial: string): boolean {
    return PUBLIC.includes('*') || PUBLIC.includes(serial)
}

/**
 * 붙어 있는 것 전부.
 *
 * `adb devices -l` 한 줄이 이렇게 생겼다:
 *   `emulator-5554  device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 …`
 *   `192.168.0.40:5555  device product:r11q model:SM_S911N …`
 */
export async function list(): Promise<DeviceInfo[]> {
    const r = await device.adb(['devices', '-l'], 8_000, true)
    const out = r.stdout.toString('utf8')
    const devices: DeviceInfo[] = []

    for (const line of out.split('\n').slice(1)) {
        const m = line.match(/^(\S+)\s+(\S+)(.*)$/)
        if (!m) continue
        const [, serial, state, rest] = m
        if (state === 'offline' && !rest) continue
        devices.push({
            serial,
            state,
            // 에뮬레이터는 serial 로 갈린다. `adb connect` 로 붙은 실기기는 `IP:포트` 다
            kind: serial.startsWith('emulator-') ? 'emulator' : 'real',
            model: rest.match(/model:(\S+)/)?.[1]?.replace(/_/g, ' ') ?? '',
            selectable: selectable(serial),
            current: serial === device.target(),
        })
    }
    return devices
}

/**
 * 보는 기기를 바꾼다.
 *
 * **허용 목록에 없으면 거절한다.** 화면에서 온 값이 그대로 adb 의 `-s` 로 가는 자리이기도
 * 하고(그 자체로도 막아야 한다), 무엇보다 위 §공개 화면 이유가 여기서 지켜진다.
 */
export async function select(serial: string): Promise<{ ok: boolean; error?: string }> {
    if (!selectable(serial)) return { ok: false, error: '공개 화면에서 고를 수 없는 기기예요' }
    const all = await list()
    const found = all.find((d) => d.serial === serial)
    if (!found) return { ok: false, error: '붙어 있지 않은 기기예요' }
    if (found.state !== 'device') return { ok: false, error: `기기 상태가 ${found.state} 예요` }
    device.setTarget(serial)
    return { ok: true }
}

/**
 * 지금 보는 기기가 사라졌으면 **에뮬레이터로 되돌린다.**
 *
 * 실기기는 들고 나가면 그대로 없어진다(Wi-Fi 디버깅은 화면이 꺼져도 끊긴다). 그 상태로
 * 두면 화면이 영영 검고 시나리오는 전부 "기기 없음"으로 떨어지는데, 원인은 화면에 안 보인다.
 */
export async function healthcheck(): Promise<string | null> {
    const all = await list()
    const current = all.find((d) => d.serial === device.target())
    if (current && current.state === 'device') return null

    const fallback = all.find((d) => d.kind === 'emulator' && d.state === 'device' && d.selectable)
    if (!fallback) return null
    device.setTarget(fallback.serial)
    return fallback.serial
}
