// 시나리오별 걸린 시간을 Postgres(aiqa-db)에 남긴다.
//
// 메모리에만 두면 컨테이너를 갈아끼울 때마다 비교 표가 통째로 비고, 그 표가 이 데모의 요점이라
// 배포 직후 열어 본 사람은 빈 화면을 본다 (2026-09-07). 처음엔 증적 볼륨의 timings.json 한 장에
// 썼고, 2026-09-30 에 기본 DB 를 Postgres 로 두라는 규칙(docs/rules.md §데이터베이스)에 따라 옮겼다.
//
// **증적(스크린샷·run.json·log.txt·evidence.xlsx)은 옮기지 않는다** — 파일 그 자체가 결과물이라
// 규칙의 예외다. 증적 목록도 run.json 을 읽어 만든다(recorder.list). 그 메타데이터를 DB 에 두면
// 오래된 실행을 지우는 prune 이 폴더와 행을 둘 다 맞춰야 해서, 어긋나는 순간 목록에 없는 증적이나
// 폴더 없는 목록이 생긴다. 폴더가 곧 목록이라 하나로 둔다.
//
// **DB 가 없어도 시나리오는 돈다.** 연결이 안 되면 표가 빈 채로 뜨고 실패를 로그에 남긴다.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

export type Timing = {
    flowId: string
    name: string
    engine: 'maestro' | 'adb' | 'appium'
    ms: number
    passed: boolean
    canceled: boolean
    at: number
}

/** 남겨 두는 건수 — 메모리의 표와 같다 (runner.ts) */
export const KEEP = 200

const URL = process.env.AIQA_DATABASE_URL ?? ''
/** 옛 기록 파일. 표가 비어 있을 때 한 번만 읽어 옮긴다. 파일은 지우지 않는다(되돌릴 자리) */
const LEGACY_FILE = path.join(process.env.AIQA_RUNS_DIR ?? '/opt/aiqa/runs', 'timings.json')

const sql = URL
    ? postgres(URL, { max: 2, connect_timeout: 5, idle_timeout: 60, onnotice: () => {} })
    : null

let ready: Promise<void> | null = null

function ensureSchema(): Promise<void> {
    if (!sql) return Promise.reject(new Error('AIQA_DATABASE_URL 이 없어요'))
    ready ??= (async () => {
        await sql`
            create table if not exists aiqa_timing (
                id       bigserial primary key,
                flow_id  text    not null,
                name     text    not null,
                engine   text    not null,
                ms       integer not null,
                passed   boolean not null,
                canceled boolean not null,
                at       bigint  not null
            )`
        await sql`create index if not exists aiqa_timing_at on aiqa_timing (at)`
        await importLegacy()
    })().catch((err) => {
        ready = null
        throw err
    })
    return ready
}

/** 표가 비어 있고 옛 파일이 있으면 옮긴다. 옮긴 건수를 로그에 남긴다 — 행 수 대조용 */
async function importLegacy() {
    const [{ n }] = await sql!`select count(*)::int as n from aiqa_timing`
    if (n > 0) return
    let saved: Timing[]
    try {
        saved = JSON.parse(await readFile(LEGACY_FILE, 'utf8')) as Timing[]
    } catch {
        return // 파일이 없는 게 정상인 상태다 (새로 깐 기계)
    }
    if (!Array.isArray(saved) || saved.length === 0) return
    const rows = saved.slice(-KEEP).map(toRow)
    await sql!`insert into aiqa_timing ${sql!(rows)}`
    console.log(`[aiqa] 옛 시간 기록 ${rows.length}건을 DB 로 옮겼어요 (파일 ${saved.length}건)`)
}

function toRow(t: Timing) {
    return {
        flow_id: t.flowId,
        name: t.name,
        engine: t.engine,
        ms: Math.round(t.ms),
        passed: t.passed,
        canceled: t.canceled,
        at: t.at,
    }
}

/** 오래된 것부터 KEEP 건 */
export async function load(): Promise<Timing[]> {
    try {
        await ensureSchema()
        const rows = await sql!`
            select flow_id, name, engine, ms, passed, canceled, at
            from (select * from aiqa_timing order by at desc, id desc limit ${KEEP}) t
            order by at, id`
        return rows.map((r) => ({
            flowId: r.flow_id,
            name: r.name,
            engine: r.engine,
            ms: r.ms,
            passed: r.passed,
            canceled: r.canceled,
            at: Number(r.at),
        }))
    } catch (err) {
        console.error('[aiqa] 시간 기록을 읽지 못했어요:', (err as Error).message)
        return []
    }
}

/** 한 건 더하고 KEEP 건 밖은 지운다 */
export async function add(t: Timing) {
    try {
        await ensureSchema()
        await sql!`insert into aiqa_timing ${sql!(toRow(t))}`
        await sql!`
            delete from aiqa_timing where id not in
                (select id from aiqa_timing order by at desc, id desc limit ${KEEP})`
    } catch (err) {
        console.error('[aiqa] 시간 기록을 저장하지 못했어요:', (err as Error).message)
    }
}
