// 조작 권한 — **기기가 한 대라 손도 하나여야 한다.**
//
// 공개 데모라 같은 시각에 여러 사람이 열어 둔다. 아무나 누를 수 있게 두면 두 사람이
// 서로의 화면을 뒤집는 꼴이 되고, 그 상태로 시나리오를 돌리면 실패가 앱 탓인지 옆
// 사람 탓인지 아무도 모른다. 그래서 **잡은 사람 하나만** 누를 수 있다.
//
// 잠그는 쪽이 둘이다:
//   · `human`  — 브라우저에서 [조작] 을 누른 사람. 가만히 있으면 스스로 풀린다
//   · `runner` — Maestro 가 도는 동안. 사람 손을 통째로 막는다(사람이 못 뺏는다)

import * as screen from './screen.ts'

/** 아무 입력 없이 이만큼 지나면 놓아 준다 — 창을 닫지 않고 자리를 뜨는 일이 흔하다 */
const IDLE_RELEASE_MS = Number(process.env.AIQA_CONTROL_IDLE_MS ?? 90_000)

type Holder =
    | { kind: 'none' }
    | { kind: 'human'; viewerId: string; since: number; lastInput: number }
    | { kind: 'runner'; label: string; since: number }

let holder: Holder = { kind: 'none' }

export function snapshot() {
    if (holder.kind === 'none') return { kind: 'none' as const }
    if (holder.kind === 'runner') return { kind: 'runner' as const, label: holder.label }
    return { kind: 'human' as const, viewerId: holder.viewerId }
}

function announce() {
    screen.broadcast({ type: 'control', control: snapshot() })
}

/**
 * 사람이 잡는다. 이미 다른 사람이 쥐고 있으면 뺏지 않는다 — **먼저 잡은 사람이 임자다.**
 * 다만 오래 놀린 손은 아래 `sweep` 이 먼저 풀어 둔다.
 */
export function claim(viewerId: string): { ok: boolean; reason?: string } {
    if (holder.kind === 'runner') return { ok: false, reason: 'runner' }
    if (holder.kind === 'human' && holder.viewerId !== viewerId) return { ok: false, reason: 'taken' }
    holder = { kind: 'human', viewerId, since: Date.now(), lastInput: Date.now() }
    announce()
    return { ok: true }
}

export function release(viewerId: string) {
    if (holder.kind === 'human' && holder.viewerId === viewerId) {
        holder = { kind: 'none' }
        announce()
    }
}

/** 창을 닫았을 때. 붙어 있지 않은 사람이 손을 쥐고 있을 수는 없다 */
export function forget(viewerId: string) {
    release(viewerId)
}

/** 이 사람이 지금 눌러도 되나. 누를 때마다 여기를 지난다 */
export function mayTouch(viewerId: string): boolean {
    if (holder.kind !== 'human' || holder.viewerId !== viewerId) return false
    holder.lastInput = Date.now()
    return true
}

/** Maestro 가 시작한다. 사람 손은 그 자리에서 놓인다 */
export function lockForRunner(label: string) {
    holder = { kind: 'runner', label, since: Date.now() }
    announce()
}

export function unlockRunner() {
    if (holder.kind === 'runner') {
        holder = { kind: 'none' }
        announce()
    }
}

export function runnerBusy() {
    return holder.kind === 'runner'
}

/** 오래 놀린 손을 걷어낸다. 부르는 자리는 main 의 초당 한 번짜리 고리 하나다 */
export function sweep() {
    if (holder.kind !== 'human') return
    if (Date.now() - holder.lastInput < IDLE_RELEASE_MS) return
    holder = { kind: 'none' }
    announce()
}
