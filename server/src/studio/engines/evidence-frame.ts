import { spawn } from "node:child_process";
import type { Session } from "../domain/types.ts";
import { frame } from "./observe.ts";

// Ignore OS bars: a blank app surface may still contain clock/navigation pixels.
export async function blankAppFrame(image: Buffer): Promise<boolean> {
  const pixels = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vf", "crop=iw:ih*0.8:0:ih*0.1,scale=64:64", "-pix_fmt", "gray", "-frames:v", "1", "-f", "rawvideo", "pipe:1"]);
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => { child.kill(); reject(new Error("증적 화면 분석 시간 초과")); }, 5000);
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.resume();
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.stdin.on("error", () => {});
    child.on("close", code => {
      clearTimeout(timeout);
      const result = Buffer.concat(chunks);
      if (code !== 0 || result.length !== 4096) reject(new Error("증적 화면 분석 실패"));
      else resolve(result);
    });
    child.stdin.end(image);
  });
  let low = 255, high = 0;
  for (const pixel of pixels) { low = Math.min(low, pixel); high = Math.max(high, pixel); }
  return high - low < 12;
}

export async function targetFrame(session: Session) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const image = await frame(session);
    if (!(await blankAppFrame(image))) return image;
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("조작 직전 화면이 비어 있어 실행 후 증적을 표시해요.");
}
