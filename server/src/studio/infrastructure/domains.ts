import { randomUUID } from "node:crypto";
import type { Domain } from "../../../../contracts/studio.ts";
import { db, ensureDb } from "./repository.ts";
import { worker } from "../engines/browser.ts";
let schema: Promise<void> | undefined;
export function normalizeDomain(value: unknown) {
  if (typeof value !== "string" || value.length > 2000)
    throw new Error("올바른 주소를 입력해 주세요");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("http 또는 https 주소만 등록할 수 있어요");
  return { url: url.href, origin: url.origin };
}
async function ensureDomains() {
  schema ??= (async () => {
    await ensureDb();
    await db!`create table if not exists heimdall_domains (id text primary key, name text not null, url text not null, origin text unique not null)`;
    await db!`alter table heimdall_domains add column if not exists environment text not null default 'web'`;
    await db!`create table if not exists heimdall_migrations (id text primary key)`;
    await db!`with seeded as (insert into heimdall_migrations values ('initial-domains') on conflict do nothing returning id) insert into heimdall_domains (id, name, url, origin) select 'default', '기본 테스트', 'http://127.0.0.1:8081/demo/', 'http://127.0.0.1:8081' from seeded on conflict do nothing`;
  })().catch((e) => {
    schema = undefined;
    throw e;
  });
  await schema;
}
export async function listDomains(): Promise<Domain[]> {
  await ensureDomains();
  const rows =
    await db!`select id, name, url, origin, environment from heimdall_domains order by name`;
  return rows.map((d) => ({
    id: String(d.id),
    name: String(d.name),
    url: String(d.url),
    origin: String(d.origin),
    environment: d.environment as Domain["environment"],
  }));
}
export async function syncDomains() {
  const domains = await listDomains();
  await worker("/configure", { origins: domains.map((d) => d.origin) });
  return domains;
}
export async function saveDomain(data: {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  environment?: unknown;
}) {
  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.trim().length > 80
  )
    throw new Error("도메인 이름을 1~80자로 입력해 주세요");
  const environment = data.environment ?? "web";
  if (!["web", "app", "api"].includes(String(environment)))
    throw new Error("실행 환경을 선택해 주세요");
  const normalized = normalizeDomain(data.url);
  await ensureDomains();
  const id = typeof data.id === "string" && data.id ? data.id : randomUUID();
  const existing = await listDomains();
  if (existing.length >= 100 && !existing.some((d) => d.id === id))
    throw new Error("도메인은 최대 100개까지 등록할 수 있어요");
  await db!`insert into heimdall_domains (id, name, url, origin, environment) values (${id}, ${data.name.trim()}, ${normalized.url}, ${normalized.origin}, ${String(environment)}) on conflict (id) do update set name=excluded.name, url=excluded.url, origin=excluded.origin, environment=excluded.environment`;
  await syncDomains();
  return listDomains();
}
export async function removeDomain(id: unknown) {
  if (typeof id !== "string" || !id) throw new Error("도메인을 선택해 주세요");
  await ensureDomains();
  await db!`delete from heimdall_domains where id=${id}`;
  await syncDomains();
  return listDomains();
}
export async function requireDomain(value: string) {
  const target = normalizeDomain(value);
  if (!(await syncDomains()).some((d) => d.origin === target.origin))
    throw new Error("관리자가 등록한 도메인만 사용할 수 있어요");
}
