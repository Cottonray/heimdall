import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, open, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const exec = promisify(execFile);
let current:
  { id: string; dir: string; size: number; offset: number } | undefined;
export async function installApp(udid: string, data: any) {
  if (!data || !/^[a-f0-9-]{36}$/.test(data.id))
    throw new Error("앱 요청을 확인해 주세요");
  if (data.phase === "begin") {
    if (
      !Number.isSafeInteger(data.size) ||
      data.size < 4 ||
      data.size > 300 * 1024 * 1024
    )
      throw new Error("앱 크기를 확인해 주세요");
    if (current) await rm(current.dir, { recursive: true, force: true });
    current = {
      id: data.id,
      dir: await mkdtemp(path.join(tmpdir(), "heimdall-app-")),
      size: data.size,
      offset: 0,
    };
    const file = await open(path.join(current.dir, "app.zip"), "wx", 0o600);
    await file.close();
  } else {
    const u = current;
    if (!u || u.id !== data.id) throw new Error("앱 전송을 다시 시작해 주세요");
    if (data.phase === "chunk") {
      if (
        data.offset !== u.offset ||
        typeof data.data !== "string" ||
        data.data.length > 524288
      )
        throw new Error("앱 전송 순서를 확인해 주세요");
      const bytes = Buffer.from(data.data, "base64");
      if (!bytes.length || u.offset + bytes.length > u.size)
        throw new Error("앱 크기를 확인해 주세요");
      const file = await open(path.join(u.dir, "app.zip"), "r+");
      try {
        let written = 0;
        while (written < bytes.length) {
          const result = await file.write(
            bytes,
            written,
            bytes.length - written,
            u.offset + written,
          );
          if (!result.bytesWritten) throw new Error("앱을 저장하지 못했어요");
          written += result.bytesWritten;
        }
      } finally {
        await file.close();
      }
      u.offset += bytes.length;
    } else if (data.phase === "finish") {
      try {
        if (u.offset !== u.size) throw new Error("앱 전송이 완료되지 않았어요");
        const zip = path.join(u.dir, "app.zip");
        const { stdout: names } = await exec("/usr/bin/unzip", ["-Z1", zip], {
          maxBuffer: 8 * 1024 * 1024,
        });
        if (
          names
            .split("\n")
            .some(
              (n) =>
                n.startsWith("/") ||
                n.includes("\\") ||
                n.split("/").includes(".."),
            )
        )
          throw new Error("안전하지 않은 ZIP 경로예요");
        const { stdout: detail } = await exec(
          "/usr/bin/unzip",
          ["-Z", "-l", zip],
          { maxBuffer: 8 * 1024 * 1024 },
        );
        if (detail.split("\n").some((n) => n.startsWith("l")))
          throw new Error("심볼릭 링크가 포함된 ZIP은 지원하지 않아요");
        const total = [
          ...detail.matchAll(/^[-d][^\n]*?\s\d+\.\d+\s+\S+\s+(\d+)\s/gm),
        ].reduce((n, m) => n + Number(m[1]), 0);
        if (total > 2 * 1024 * 1024 * 1024)
          throw new Error("압축 해제 크기가 너무 커요");
        const output = path.join(u.dir, "expanded");
        await exec("/usr/bin/unzip", ["-q", zip, "-d", output], {
          timeout: 60000,
        });
        const apps = (await readdir(output)).filter((n) => n.endsWith(".app"));
        if (apps.length !== 1)
          throw new Error("시뮬레이터용 .app 하나를 ZIP으로 압축해 주세요");
        await exec(
          "/usr/bin/xcrun",
          ["simctl", "install", udid, path.join(output, apps[0]!)],
          { timeout: 120000 },
        );
      } finally {
        current = undefined;
        await rm(u.dir, { recursive: true, force: true });
      }
    } else throw new Error("지원하지 않는 앱 요청이에요");
  }
  return Buffer.from(JSON.stringify({ ok: true }));
}
