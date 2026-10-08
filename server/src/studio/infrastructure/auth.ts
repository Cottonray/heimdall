import {
  createHash,
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "../../../../contracts/studio.ts";
import { db, ensureDb } from "./repository.ts";
const scrypt = promisify(derive);
const COOKIE = "heimdall_session";
export const authEvents = new EventEmitter();
export const localRequest = (req: IncomingMessage) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    req.socket.remoteAddress || "",
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + ((await scrypt(password, salt, 64)) as Buffer).toString("hex")
  );
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || hash.length !== 128) return false;
  return timingSafeEqual(
    (await scrypt(password, salt, 64)) as Buffer,
    Buffer.from(hash, "hex"),
  );
}
let schema: Promise<void> | undefined;
async function ensureAuth() {
  schema ??= (async () => {
    await ensureDb();
    await db!`create table if not exists heimdall_users (id text primary key, username text unique not null, name text not null, role text not null check(role in ('user','admin')), password_hash text not null)`;
    await db!`create table if not exists heimdall_logins (token_hash text primary key, user_id text not null references heimdall_users(id), expires bigint not null)`;
    for (const [username, name, role, password] of [
      ["tester", "테스트 사용자", "user", process.env.AIQA_TEST_USER_PASSWORD],
      ["admin", "관리자", "admin", process.env.AIQA_TEST_ADMIN_PASSWORD],
    ]) {
      if (password && password.length >= 16) {
        const exists =
          await db!`select id from heimdall_users where username=${username!}`;
        if (!exists.length)
          await db!`insert into heimdall_users values (${username!}, ${username!}, ${name!}, ${role!}, ${await hashPassword(password)}) on conflict do nothing`;
      }
    }
  })().catch((e) => {
    schema = undefined;
    throw e;
  });
  await schema;
}
export function sessionHash(req: IncomingMessage) {
  const token = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? createHash("sha256").update(token).digest("hex")
    : "";
}
export async function authenticate(
  req: IncomingMessage,
): Promise<{ user: User; expires: number; hash: string } | null> {
  const hash = sessionHash(req);
  if (!hash) return null;
  await ensureAuth();
  const rows =
    await db!`select u.id,u.username,u.name,u.role,l.expires from heimdall_logins l join heimdall_users u on u.id=l.user_id where l.token_hash=${hash} and l.expires>${Date.now()}`;
  const row = rows[0];
  return row
    ? {
        user: {
          id: String(row.id),
          username: String(row.username),
          name: String(row.name),
          role: row.role as User["role"],
        },
        expires: Number(row.expires),
        hash,
      }
    : null;
}
const failures = new Map<string, { count: number; until: number }>();
export async function login(
  req: IncomingMessage,
  res: ServerResponse,
  data: { username?: unknown; password?: unknown; role?: unknown },
) {
  const key = req.socket.remoteAddress || "unknown";
  for (const [k, v] of failures) if (v.until < Date.now()) failures.delete(k);
  if ((failures.get(key)?.count || 0) >= 10)
    throw new Error("로그인 시도가 많아요. 15분 후 다시 시도해 주세요");
  if (
    typeof data.username !== "string" ||
    typeof data.password !== "string" ||
    data.password.length > 256
  )
    throw new Error("아이디와 비밀번호를 입력해 주세요");
  await ensureAuth();
  const rows =
    await db!`select * from heimdall_users where username=${data.username.trim()}`;
  const row = rows[0];
  const valid = await verifyPassword(
    data.password,
    row?.password_hash || "00000000000000000000000000000000:" + "0".repeat(128),
  );
  if (!row || !valid || row.role !== data.role) {
    failures.set(key, {
      count: (failures.get(key)?.count || 0) + 1,
      until: Date.now() + 900000,
    });
    throw new Error("아이디 또는 비밀번호를 확인해 주세요");
  }
  failures.delete(key);
  await logout(req, res);
  const token = randomBytes(32).toString("base64url");
  await db!`insert into heimdall_logins values (${createHash("sha256").update(token).digest("hex")}, ${row.id}, ${Date.now() + 30 * 24 * 3600000})`;
  await db!`delete from heimdall_logins where expires<${Date.now()}`;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/aiqa; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
  );
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    role: row.role as User["role"],
  };
}
export async function logout(req: IncomingMessage, res: ServerResponse) {
  const hash = sessionHash(req);
  if (hash) {
    await ensureAuth();
    await db!`delete from heimdall_logins where token_hash=${hash}`;
    authEvents.emit("revoke", hash);
  }
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; Path=/aiqa; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
}
