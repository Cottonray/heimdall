import { randomUUID } from "node:crypto";
import { db, ensureDb, requireProject } from "./repository.ts";
let schema: Promise<unknown> | undefined;
async function ready(projectId: string) {
  await ensureDb();
  await requireProject(projectId);
  schema ??=
    db!`create table if not exists aiqa_test_data (id text primary key, project_id text not null references aiqa_projects(id), name text not null, content text not null, updated bigint not null)`
      .then(async () => {
        await db!`alter table aiqa_test_data add column if not exists customer_number text not null default '', add column if not exists tags text not null default ''`;
      })
      .catch((error: unknown) => {
        schema = undefined;
        throw error;
      });
  await schema;
}
export async function listTestData(projectId: string) {
  await ready(projectId);
  return db!`select id, name, content, updated, customer_number as "customerNumber", tags from aiqa_test_data where project_id=${projectId} order by updated desc`;
}
export async function saveTestData(data: {
  projectId?: unknown;
  id?: unknown;
  name?: unknown;
  customerNumber?: unknown;
  tags?: unknown;
  content?: unknown;
  remove?: unknown;
}) {
  if (typeof data.projectId !== "string")
    throw new Error("프로젝트를 선택해 주세요.");
  await ready(data.projectId);
  if (
    data.id !== undefined &&
    (typeof data.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id))
  )
    throw new Error("데이터를 확인해 주세요.");
  if (data.remove === true) {
    if (!data.id) throw new Error("데이터를 선택해 주세요.");
    await db!`delete from aiqa_test_data where id=${String(data.id)} and project_id=${data.projectId}`;
    return;
  }
  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 80 ||
    typeof data.content !== "string" ||
    data.content.length > 50000
  )
    throw new Error("이름과 JSON 데이터를 확인해 주세요.");
  const customerNumber = data.customerNumber ?? "";
  const tags = data.tags ?? "";
  if (
    typeof customerNumber !== "string" ||
    customerNumber.length > 80 ||
    typeof tags !== "string" ||
    tags.length > 500
  )
    throw new Error("고객번호와 태그를 확인해 주세요.");
  JSON.parse(data.content);
  if (data.id)
    await db!`update aiqa_test_data set customer_number=${customerNumber.trim()}, tags=${tags.trim()}, name=${data.name.trim()}, content=${data.content}, updated=${Date.now()} where id=${String(data.id)} and project_id=${data.projectId}`;
  else
    await db!`insert into aiqa_test_data (id, project_id, name, content, updated, customer_number, tags) values (${randomUUID()}, ${data.projectId}, ${data.name.trim()}, ${data.content}, ${Date.now()}, ${customerNumber.trim()}, ${tags.trim()})`;
}
