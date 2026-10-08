import { randomUUID } from "node:crypto";
import { db, ensureDb } from "./repository.ts";
let schema: Promise<unknown> | undefined;
async function ready() {
  await ensureDb();
  schema ??=
    db!`create table if not exists heimdall_posts (id text primary key, author_id text not null, title text not null, content text not null, created bigint not null, updated bigint not null, deleted boolean not null default false)`.catch(
      (e: unknown) => {
        schema = undefined;
        throw e;
      },
    );
  await schema;
}
export async function posts() {
  await ready();
  return db!`select p.id,p.author_id as "authorId",coalesce(u.name,'알 수 없는 사용자') as author,p.title,p.content,p.created,p.updated from heimdall_posts p left join heimdall_users u on u.id=p.author_id where not p.deleted order by p.created desc`;
}
export async function savePost(
  user: { id: string; role: string },
  data: { id?: unknown; title?: unknown; content?: unknown; remove?: unknown },
) {
  await ready();
  if (
    data.id !== undefined &&
    (typeof data.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id))
  )
    throw new Error("게시글을 확인해 주세요.");
  if (
    data.remove !== true &&
    (typeof data.title !== "string" ||
      !data.title.trim() ||
      data.title.length > 150 ||
      typeof data.content !== "string" ||
      !data.content.trim() ||
      data.content.length > 20000)
  )
    throw new Error("제목과 내용을 확인해 주세요.");
  if (data.id) {
    const rows =
      data.remove === true
        ? await db!`update heimdall_posts set deleted=true,updated=${Date.now()} where id=${String(data.id)} and not deleted and (author_id=${user.id} or ${user.role}='admin') returning id`
        : await db!`update heimdall_posts set title=${String(data.title).trim()},content=${String(data.content).trim()},updated=${Date.now()} where id=${String(data.id)} and not deleted and (author_id=${user.id} or ${user.role}='admin') returning id`;
    if (!rows.length) throw new Error("게시글이 없거나 수정 권한이 없어요.");
  } else {
    if (data.remove === true) throw new Error("게시글을 선택해 주세요.");
    await db!`insert into heimdall_posts (id,author_id,title,content,created,updated) values (${randomUUID()},${user.id},${String(data.title).trim()},${String(data.content).trim()},${Date.now()},${Date.now()})`;
  }
}
