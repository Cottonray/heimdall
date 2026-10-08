import { db, ensureDb, listSessions } from "./repository.ts";
import type { StudioNotification } from "../../../../contracts/studio.ts";
let schema: Promise<unknown> | undefined;
async function ready() {
  await ensureDb();
  schema ??=
    db!`create table if not exists aiqa_notification_reads (user_id text not null, notification_id text not null, primary key (user_id, notification_id))`.catch(
      (error: unknown) => {
        schema = undefined;
        throw error;
      },
    );
  await schema;
}
export async function notifications(
  userId: string,
): Promise<StudioNotification[]> {
  await ready();
  const [sessions, reads] = await Promise.all([
    listSessions(),
    db!`select notification_id from aiqa_notification_reads where user_id=${userId}`,
  ]);
  const read = new Set(reads.map((row) => String(row.notification_id)));
  return sessions
    .flatMap((session) =>
      session.steps
        .filter(
          (step) =>
            !step.ok ||
            step.action.type === "assert" ||
            step.action.type === "api",
        )
        .map((step) => {
          const id = `${session.id}:${step.n}:${step.at}`;
          return {
            id,
            sessionId: session.id,
            title: `${session.name} · ${step.ok ? "검증 통과" : "동작 실패"}`,
            message:
              step.error ||
              (step.ok
                ? "검증을 통과했어요."
                : "테스트 기록에서 실패 원인을 확인해 주세요."),
            at: step.at,
            read: read.has(id),
          };
        }),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 100);
}
export async function readNotifications(userId: string, ids: unknown) {
  if (
    !Array.isArray(ids) ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== "string")
  )
    throw new Error("알림을 확인해 주세요.");
  const visible = new Set((await notifications(userId)).map((item) => item.id));
  for (const id of ids) {
    if (!visible.has(id)) continue;
    await db!`insert into aiqa_notification_reads (user_id, notification_id) values (${userId}, ${id}) on conflict do nothing`;
  }
}
