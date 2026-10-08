import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  open,
  rename,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import { DIR } from "./config.ts";
const root = path.join(DIR, "apps");
const MAX = 300 * 1024 * 1024;
type App = {
  id: string;
  name: string;
  filename: string;
  size: number;
  created: string;
  platform: "android" | "ios";
};
const uploads = new Map<
  string,
  { owner: string; app: App; offset: number; seen: number; busy: boolean }
>();
export async function appList(): Promise<App[]> {
  await mkdir(root, { recursive: true });
  const files = await readdir(root);
  const apps = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(
        async (f) =>
          JSON.parse(await readFile(path.join(root, f), "utf8")) as App,
      ),
  );
  return apps.sort((a, b) => b.created.localeCompare(a.created));
}
export async function appFile(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("앱을 확인해 주세요");
  const app = JSON.parse(
    await readFile(path.join(root, id + ".json"), "utf8"),
  ) as App;
  return {
    app,
    file: path.join(root, id + (app.platform === "ios" ? ".zip" : ".apk")),
  };
}
export async function beginUpload(
  owner: string,
  filename: string,
  size: number,
) {
  if (
    !/\.(apk|zip)$/i.test(filename) ||
    filename.length > 200 ||
    !Number.isSafeInteger(size) ||
    size < 4 ||
    size > MAX
  )
    throw new Error("300MB 이하 APK 또는 시뮬레이터 앱 ZIP을 선택해 주세요");
  await mkdir(root, { recursive: true });
  for (const [id, item] of uploads)
    if (!item.busy && Date.now() - item.seen > 3600000) {
      uploads.delete(id);
      await rm(path.join(root, id + ".part"), { force: true });
    }
  if ([...uploads.values()].filter((u) => u.owner === owner).length >= 3)
    throw new Error("진행 중인 업로드를 먼저 완료해 주세요");
  const app: App = {
    id: randomUUID(),
    name: path.basename(filename).replace(/\.(apk|zip)$/i, ""),
    filename: path.basename(filename),
    size,
    created: new Date().toISOString(),
    platform: filename.toLowerCase().endsWith(".zip") ? "ios" : "android",
  };
  await writeFile(path.join(root, app.id + ".part"), "", {
    mode: 0o600,
    flag: "wx",
  });
  uploads.set(app.id, { owner, app, offset: 0, seen: Date.now(), busy: false });
  return { id: app.id };
}
export async function uploadChunk(
  owner: string,
  id: string,
  offset: number,
  req: IncomingMessage,
) {
  const u = uploads.get(id);
  if (!u || u.owner !== owner || u.busy || offset !== u.offset)
    throw new Error("업로드 상태를 확인하고 다시 시도해 주세요");
  u.busy = true;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > 512 * 1024 || u.offset + size > u.app.size)
        throw new Error("파일 크기를 확인해 주세요");
      chunks.push(b);
    }
    if (!size) throw new Error("빈 업로드예요");
    const body = Buffer.concat(chunks);
    if (
      u.offset === 0 &&
      (body.length < 4 || body.readUInt32LE(0) !== 0x04034b50)
    )
      throw new Error("APK 파일 형식을 확인해 주세요");
    const positioned = await open(path.join(root, id + ".part"), "r+");
    try {
      let written = 0;
      while (written < body.length) {
        const result = await positioned.write(
          body,
          written,
          body.length - written,
          offset + written,
        );
        if (!result.bytesWritten) throw new Error("파일을 저장하지 못했어요");
        written += result.bytesWritten;
      }
    } finally {
      await positioned.close();
    }
    u.offset += size;
    u.seen = Date.now();
    if (u.offset === u.app.size) {
      try {
        const { stdout } = await promisify(execFile)(
          "unzip",
          ["-Z1", path.join(root, id + ".part")],
          { timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
        );
        if (
          u.app.platform === "android"
            ? !stdout.split("\n").includes("AndroidManifest.xml")
            : !stdout
                .split("\n")
                .some((name) => /^[^/]+\.app\/Info\.plist$/.test(name))
        )
          throw new Error("APK");
      } catch {
        uploads.delete(id);
        await rm(path.join(root, id + ".part"), { force: true });
        throw new Error(
          "APK 또는 최상위 .app이 포함된 ZIP 파일을 확인해 주세요",
        );
      }
      await rename(
        path.join(root, id + ".part"),
        path.join(root, id + (u.app.platform === "ios" ? ".zip" : ".apk")),
      );
      await writeFile(path.join(root, id + ".json"), JSON.stringify(u.app), {
        mode: 0o600,
      });
      uploads.delete(id);
    }
    return { offset: u.offset, complete: u.offset === u.app.size };
  } finally {
    u.busy = false;
  }
}
