import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "../../../../contracts/studio.ts";
import { db, ensureDb } from "./repository.ts";
import {
  avatarKey,
  avatarStorageAvailable,
  decodeAvatar,
  deleteAvatar,
  enforceAvatarBudget,
  getAvatar,
  putAvatar,
} from "./avatar-storage.ts";
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
  if (!salt || !/^[a-f0-9]{128}$/.test(hash || "")) return false;
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
    await db!`alter table heimdall_users add column if not exists avatar_key text, add column if not exists avatar_version text, add column if not exists avatar_bytes integer not null default 0`;
    await db!`create table if not exists heimdall_logins (token_hash text primary key, user_id text not null references heimdall_users(id), expires bigint not null)`;
    if (process.env.AIQA_TEST_LOGIN_ENABLED === "true") {
      for (const role of ["user", "admin"] as const) {
        const id = "demo-" + role;
        const name = role === "admin" ? "테스트 관리자" : "테스트 사용자";
        await db!`insert into heimdall_users (id,username,name,role,password_hash) values (${id}, ${id}, ${name}, ${role}, ${await hashPassword(randomBytes(32).toString("hex"))}) on conflict do nothing`;
      }
    }
    for (const [username, name, role, password] of [
      ["tester", "테스트 사용자", "user", process.env.AIQA_TEST_USER_PASSWORD],
      ["admin", "관리자", "admin", process.env.AIQA_TEST_ADMIN_PASSWORD],
    ]) {
      if (password && password.length >= 16) {
        const exists =
          await db!`select id from heimdall_users where username=${username!}`;
        if (!exists.length)
          await db!`insert into heimdall_users (id,username,name,role,password_hash) values (${username!}, ${username!}, ${name!}, ${role!}, ${await hashPassword(password)}) on conflict do nothing`;
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
function publicUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    role: row.role as User["role"],
    avatar: row.avatar_key
      ? "/aiqa/api/studio/profile/avatar?v=" +
        encodeURIComponent(String(row.avatar_version))
      : null,
    avatarUploadAllowed: avatarStorageAvailable(),
    passwordChangeAllowed: !String(row.id).startsWith("demo-"),
  };
}
export type AuthSession = { user: User; expires: number; hash: string };
export async function authenticate(
  req: IncomingMessage,
): Promise<AuthSession | null> {
  const hash = sessionHash(req);
  if (!hash) return null;
  await ensureAuth();
  const rows =
    await db!`select u.id,u.username,u.name,u.role,u.avatar_key,u.avatar_version,l.expires from heimdall_logins l join heimdall_users u on u.id=l.user_id where l.token_hash=${hash} and l.expires>${Date.now()}`;
  const row = rows[0];
  return row
    ? {
        user: publicUser(row),
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
  if (
    !row ||
    !valid ||
    row.id.startsWith("demo-") ||
    (data.role && row.role !== data.role)
  ) {
    failures.set(key, {
      count: (failures.get(key)?.count || 0) + 1,
      until: Date.now() + 900000,
    });
    throw new Error("아이디 또는 비밀번호를 확인해 주세요");
  }
  failures.delete(key);
  return issueSession(req, res, publicUser(row));
}
export async function testLogin(
  req: IncomingMessage,
  res: ServerResponse,
  role: unknown,
) {
  if (
    process.env.AIQA_TEST_LOGIN_ENABLED !== "true" ||
    !["user", "admin"].includes(String(role))
  )
    throw new Error("테스트 로그인을 사용할 수 없어요");
  await ensureAuth();
  const rows =
    await db!`select id,username,name,role,avatar_key,avatar_version from heimdall_users where id=${"demo-" + role}`;
  const user = publicUser(rows[0]);
  return issueSession(req, res, user);
}
async function issueSession(
  req: IncomingMessage,
  res: ServerResponse,
  user: User,
) {
  await logout(req, res);
  const token = randomBytes(32).toString("base64url");
  await db!`insert into heimdall_logins (token_hash,user_id,expires) values (${createHash("sha256").update(token).digest("hex")}, ${user.id}, ${Date.now() + 30 * 24 * 3600000})`;
  await db!`delete from heimdall_logins where expires<${Date.now()}`;
  setSessionCookie(res, token);
  return user;
}
function setSessionCookie(res: ServerResponse, token: string) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/aiqa; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
  );
}

const changes = new Map<string, { count: number; until: number }>();
function limitChange(key: string, count: number, duration: number) {
  for (const [id, entry] of changes)
    if (entry.until <= Date.now()) changes.delete(id);
  const entry = changes.get(key) || { count: 0, until: Date.now() + duration };
  if (entry.count >= count)
    throw new Error("변경 요청이 많아요. 잠시 후 다시 시도해 주세요");
  changes.set(key, { ...entry, count: entry.count + 1 });
}
export function validatePasswordChange(
  userId: string,
  currentPassword: unknown,
  newPassword: unknown,
) {
  if (userId.startsWith("demo-"))
    throw new Error("테스트용 바로 로그인 계정은 비밀번호를 변경할 수 없어요");
  if (
    typeof currentPassword !== "string" ||
    !currentPassword ||
    currentPassword.length > 256
  )
    throw new Error("현재 비밀번호를 입력해 주세요");
  if (
    typeof newPassword !== "string" ||
    newPassword.length < 12 ||
    newPassword.length > 256
  )
    throw new Error("새 비밀번호는 12~256자로 입력해 주세요");
  if (currentPassword === newPassword)
    throw new Error("현재 비밀번호와 다른 비밀번호를 입력해 주세요");
  return { currentPassword, newPassword };
}
export async function changePassword(
  auth: AuthSession,
  res: ServerResponse,
  data: { currentPassword?: unknown; newPassword?: unknown },
) {
  const { currentPassword, newPassword } = validatePasswordChange(
    auth.user.id,
    data.currentPassword,
    data.newPassword,
  );
  limitChange("password:" + auth.user.id, 10, 15 * 60 * 1000);
  await ensureAuth();
  const token = randomBytes(32).toString("base64url");
  const revoked = await db!.begin(async (sql) => {
    const rows =
      await sql`select password_hash from heimdall_users where id=${auth.user.id} for update`;
    const row = rows[0];
    if (
      !row ||
      !(await verifyPassword(currentPassword, String(row.password_hash)))
    )
      throw new Error("현재 비밀번호가 일치하지 않아요");
    await sql`update heimdall_users set password_hash=${await hashPassword(newPassword)} where id=${auth.user.id}`;
    const old =
      await sql`delete from heimdall_logins where user_id=${auth.user.id} returning token_hash`;
    await sql`insert into heimdall_logins (token_hash,user_id,expires) values (${createHash("sha256").update(token).digest("hex")}, ${auth.user.id}, ${Date.now() + 30 * 24 * 3600000})`;
    return old.map((row) => String(row.token_hash));
  });
  setSessionCookie(res, token);
  for (const hash of revoked) authEvents.emit("revoke", hash);
  return { ok: true };
}

export async function updateProfile(user: User, value: unknown): Promise<User> {
  if (value === undefined) throw new Error("프로필 이미지를 선택해 주세요");
  const image = value === null ? null : decodeAvatar(value);
  if (image && !avatarStorageAvailable())
    throw new Error("프로필 이미지 저장소가 설정되지 않았어요");
  limitChange("avatar:" + user.id, 5, 60000);
  await ensureAuth();
  const version = randomUUID();
  const key = image ? avatarKey(user.id, version) : null;
  let uploaded = false;
  let previous = "";
  try {
    const result = await db!.begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(7348219)`;
      const rows =
        await sql`select avatar_key from heimdall_users where id=${user.id} for update`;
      if (!rows[0]) throw new Error("계정을 찾지 못했어요");
      previous = String(rows[0].avatar_key || "");
      if (image && key) {
        await enforceAvatarBudget(image.bytes.length);
        await putAvatar(key, image);
        uploaded = true;
      }
      const updated =
        await sql`update heimdall_users set avatar_key=${key},avatar_version=${image ? version : null},avatar_bytes=${image?.bytes.length || 0} where id=${user.id} returning id,username,name,role,avatar_key,avatar_version`;
      return publicUser(updated[0]);
    });
    if (previous && avatarStorageAvailable())
      await deleteAvatar(previous).catch(() =>
        console.error("Heimdall: 이전 프로필 이미지 정리 실패"),
      );
    return result;
  } catch (error) {
    if (uploaded && key)
      await deleteAvatar(key).catch(() =>
        console.error("Heimdall: 실패한 프로필 이미지 정리 실패"),
      );
    throw error;
  }
}
export async function readProfileAvatar(user: User) {
  await ensureAuth();
  const rows =
    await db!`select avatar_key from heimdall_users where id=${user.id}`;
  return rows[0]?.avatar_key ? getAvatar(String(rows[0].avatar_key)) : null;
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

export async function listUsers() {
  await ensureAuth();
  return await db!`select id, username, name, role from heimdall_users order by username`;
}

export async function editUser(
  actorId: string,
  data: { id?: unknown; name?: unknown; role?: unknown },
) {
  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 80 ||
    !["user", "admin"].includes(String(data.role))
  )
    throw new Error("이름과 권한을 확인해 주세요.");
  if (data.id === actorId && data.role !== "admin")
    throw new Error("본인의 관리자 권한은 해제할 수 없어요.");
  await ensureAuth();
  await db!.begin(async (sql) => {
    await sql`lock table heimdall_users in share row exclusive mode`;
    const [actor] =
      await sql`select role from heimdall_users where id=${actorId}`;
    if (actor?.role !== "admin") throw new Error("관리자만 수정할 수 있어요.");
    const rows =
      await sql`update heimdall_users set name=${String(data.name).trim()}, role=${String(data.role)} where id=${String(data.id)} returning id`;
    if (!rows.length) throw new Error("사용자를 찾을 수 없어요.");
  });
}
