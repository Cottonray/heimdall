import { readFile, readdir, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { decodeAvatar, putCameraImage } from "./avatar-storage.ts";
const exec = promisify(execFile);
let busy = false;
async function cameraPath(serial: string) {
  if (serial !== "emulator-5554")
    throw new Error(
      serial.startsWith("ios:")
        ? "현재 iOS Simulator는 외부 이미지를 카메라 입력으로 넣는 기능을 지원하지 않아요."
        : "현재 서버의 Android 에뮬레이터에서만 지원해요.",
    );
  for (const pid of await readdir("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    const args = await readFile(`/proc/${pid}/cmdline`)
      .then((b) => b.toString().split("\0"))
      .catch(() => [] as string[]);
    if (
      !args[0]?.includes("qemu-system") ||
      args.includes("-port") ||
      args.includes("-ports")
    )
      continue;
    const source = args[args.indexOf("-camera-back") + 1];
    if (source?.startsWith("imagefile:/"))
      return source.slice("imagefile:".length);
  }
  throw new Error("이미지 카메라가 설정된 에뮬레이터가 없어요.");
}
export async function cameraAvailable(serial: string) {
  try {
    await cameraPath(serial);
    return { supported: true };
  } catch (error) {
    return { supported: false, reason: (error as Error).message };
  }
}
export async function applyCameraImage(
  serial: string,
  data: unknown,
  authorized: () => boolean,
) {
  if (busy)
    throw new Error(
      "다른 카메라 이미지를 적용하고 있어요. 잠시 후 다시 시도해 주세요.",
    );
  busy = true;
  let input = "",
    output = "";
  try {
    const destination = await cameraPath(serial);
    const image = decodeAvatar(data);
    if (!["image/png", "image/jpeg"].includes(image.mime))
      throw new Error("PNG 또는 JPEG 이미지를 선택해 주세요.");
    input = `/tmp/heimdall-camera-${randomUUID()}`;
    output = `${destination}.${randomUUID()}.png`;
    await writeFile(input, image.bytes, { mode: 0o600 });
    await exec(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        input,
        "-frames:v",
        "1",
        "-update",
        "1",
        output,
      ],
      { timeout: 15000, maxBuffer: 64000 },
    );
    if (!authorized()) throw new Error("기기를 점유한 창에서 적용해 주세요.");
    await putCameraImage(serial, image);
    if (!authorized()) throw new Error("기기를 점유한 창에서 적용해 주세요.");
    await rename(output, destination);
    return { ok: true };
  } finally {
    await Promise.all(
      [input, output]
        .filter(Boolean)
        .map((p) => unlink(p).catch(() => undefined)),
    );
    busy = false;
  }
}
