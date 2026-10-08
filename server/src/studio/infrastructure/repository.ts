import postgres from "postgres";
import { readSessionBody } from "../domain/serialization.ts";
import type { Session, PublicSession } from "../domain/types.ts";
import { sessions, publicSession, compact } from "../domain/session.ts";
import { publish } from "./events.ts";
const db = process.env.AIQA_DATABASE_URL
  ? postgres(process.env.AIQA_DATABASE_URL, { max: 2, connect_timeout: 5 })
  : null;
let schema: Promise<unknown> | undefined;
export async function ensureDb() {
  if (!db) throw new Error("시나리오를 저장할 DB가 연결되지 않았어요");
  schema ??=
    db`create table if not exists aiqa_studio (id text primary key, body jsonb not null, updated bigint not null)`.catch(
      (e) => {
        schema = undefined;
        throw e;
      },
    );
  await schema;
}
export async function persist(s: Session) {
  s.updated = Date.now();
  await ensureDb();
  await db!`insert into aiqa_studio (id, body, updated) values (${s.id}, ${db!.json(JSON.parse(JSON.stringify(publicSession(s))) as postgres.JSONValue)}, ${s.updated}) on conflict (id) do update set body=excluded.body, updated=excluded.updated`;
  publish(compact(publicSession(s)));
}
export async function saved(id: string): Promise<PublicSession> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("잘못된 세션이에요");
  if (sessions.has(id)) return publicSession(sessions.get(id)!);
  await ensureDb();
  const rows = await db!`select body from aiqa_studio where id=${id}`;
  if (!rows[0]) throw new Error("시나리오를 찾지 못했어요");
  return {
    ...readSessionBody(rows[0].body),
    state: "closed",
    working: false,
    ai: false,
  };
}

export async function listSessions(): Promise<PublicSession[]> {
  await ensureDb();
  const rows =
    await db!`select body from aiqa_studio order by updated desc limit 60`;
  return rows.map((row) => {
    const body = readSessionBody(row.body);
    return compact(
      sessions.has(body.id)
        ? publicSession(sessions.get(body.id)!)
        : { ...body, state: "closed", ai: false, working: false },
    );
  });
}
