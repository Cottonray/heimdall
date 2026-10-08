import { randomUUID } from "node:crypto";
import type { Project } from "../../../../contracts/studio.ts";
import postgres from "postgres";
import { readSessionBody } from "../domain/serialization.ts";
import type { Session, PublicSession } from "../domain/types.ts";
import { sessions, publicSession, compact } from "../domain/session.ts";
import { publish } from "./events.ts";
export const db = process.env.AIQA_DATABASE_URL
  ? postgres(process.env.AIQA_DATABASE_URL, { max: 2, connect_timeout: 5 })
  : null;
let schema: Promise<unknown> | undefined;
export async function ensureDb() {
  if (!db) throw new Error("시나리오를 저장할 DB가 연결되지 않았어요");
  schema ??= (async () => {
    await db`create table if not exists aiqa_studio (id text primary key, body jsonb not null, updated bigint not null)`;
    await db`create table if not exists aiqa_projects (id text primary key, name text not null, created timestamptz not null default now())`;
    await db`insert into aiqa_projects (id, name) values ('default', '기본 프로젝트') on conflict (id) do nothing`;
  })().catch((e) => {
    schema = undefined;
    throw e;
  });
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

export async function listSessions(
  projectId?: string,
): Promise<PublicSession[]> {
  await ensureDb();
  const rows =
    await db!`select body from aiqa_studio where ${projectId ?? null}::text is null or coalesce((case when jsonb_typeof(body)='string' then (body #>> '{}')::jsonb else body end)->>'projectId', 'default')=${projectId ?? null} order by updated desc limit 60`;
  return rows.map((row) => {
    const body = readSessionBody(row.body);
    return compact(
      sessions.has(body.id)
        ? publicSession(sessions.get(body.id)!)
        : { ...body, state: "closed", ai: false, working: false },
    );
  });
}

export async function listProjects(): Promise<Project[]> {
  await ensureDb();
  const rows =
    await db!`select p.id, p.name, p.created, count(s.id)::int as tests from aiqa_projects p left join aiqa_studio s on coalesce((case when jsonb_typeof(s.body)='string' then (s.body #>> '{}')::jsonb else s.body end)->>'projectId', 'default')=p.id group by p.id order by p.created`;
  return rows.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    created: new Date(p.created).toISOString(),
    tests: Number(p.tests),
  }));
}
export async function requireProject(id: string) {
  await ensureDb();
  const rows = await db!`select id from aiqa_projects where id=${id}`;
  if (!rows.length) throw new Error("프로젝트를 찾지 못했어요");
  return id;
}
export function normalizeProjectName(name: unknown) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
    throw new Error("프로젝트 이름을 1~80자로 입력해 주세요");
  return name.trim();
}
export async function createProject(name: unknown): Promise<Project> {
  const normalized = normalizeProjectName(name);
  await ensureDb();
  const id = randomUUID();
  const rows =
    await db!`insert into aiqa_projects (id, name) values (${id}, ${normalized}) returning created`;
  return {
    id,
    name: normalized,
    created: new Date(rows[0]!.created).toISOString(),
    tests: 0,
  };
}
export async function renameProject(
  id: unknown,
  name: unknown,
): Promise<Project> {
  if (typeof id !== "string" || !id || id.length > 100)
    throw new Error("프로젝트를 선택해 주세요");
  const normalized = normalizeProjectName(name);
  await ensureDb();
  const rows =
    await db!`update aiqa_projects set name=${normalized} where id=${id} returning id`;
  if (!rows.length) throw new Error("프로젝트를 찾지 못했어요");
  const project = (await listProjects()).find((item) => item.id === id);
  if (!project) throw new Error("프로젝트를 찾지 못했어요");
  return project;
}
export async function moveSession(id: string, projectId: string) {
  await requireProject(projectId);
  const body = await saved(id);
  const active = sessions.get(id);
  if (active) {
    active.projectId = projectId;
    await persist(active);
    return compact(publicSession(active));
  }
  body.projectId = projectId;
  body.updated = Date.now();
  await db!`update aiqa_studio set body=${db!.json(JSON.parse(JSON.stringify(body)) as postgres.JSONValue)}, updated=${body.updated} where id=${id}`;
  publish(compact(body));
  return compact(body);
}
