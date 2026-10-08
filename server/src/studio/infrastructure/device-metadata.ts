import { db, ensureDb } from "./repository.ts";
let schema: Promise<unknown> | undefined;
async function ready() {
  await ensureDb();
  schema ??=
    db!`create table if not exists aiqa_device_metadata (serial text primary key, name text not null, notes text not null, updated bigint not null)`.catch(
      (error: unknown) => {
        schema = undefined;
        throw error;
      },
    );
  await schema;
}
export async function deviceMetadata() {
  await ready();
  return db!`select serial, name, notes, updated from aiqa_device_metadata`;
}
export async function saveDeviceMetadata(data: {
  serial?: unknown;
  name?: unknown;
  notes?: unknown;
}) {
  if (
    typeof data.serial !== "string" ||
    !data.serial ||
    data.serial.length > 200 ||
    typeof data.name !== "string" ||
    data.name.length > 120 ||
    typeof data.notes !== "string" ||
    data.notes.length > 2000
  )
    throw new Error("기기 정보를 확인해 주세요.");
  await ready();
  await db!`insert into aiqa_device_metadata (serial,name,notes,updated) values (${data.serial},${data.name.trim()},${data.notes.trim()},${Date.now()}) on conflict (serial) do update set name=excluded.name, notes=excluded.notes, updated=excluded.updated`;
}
