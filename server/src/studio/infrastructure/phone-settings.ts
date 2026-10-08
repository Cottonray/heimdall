import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const states = ["home", "roaming", "unregistered", "searching", "denied"];
export function phoneSettingsInput(data: Record<string, unknown>) {
  const phone = String(data.phone || "").trim();
  const carrier = String(data.carrier || "").trim();
  const voice = String(data.voice || "");
  const network = String(data.network || "");
  if (phone && !/^\+?[0-9]{3,15}$/.test(phone))
    throw new Error("전화번호는 숫자 3~15자리로 입력해 주세요.");
  if (carrier && !/^[A-Za-z0-9_-]{1,32}$/.test(carrier))
    throw new Error(
      "통신사 이름은 영문·숫자·밑줄·하이픈 32자 이내로 입력해 주세요.",
    );
  if (
    (voice && !states.includes(voice)) ||
    (network && !states.includes(network))
  )
    throw new Error("연결 상태를 확인해 주세요.");
  return { phone, carrier, voice, network };
}
async function adb(serial: string, args: string[]) {
  if (serial !== "emulator-5554")
    throw new Error("현재 서버의 Android 에뮬레이터에서만 지원해요.");
  const { stdout, stderr } = await exec("adb", ["-s", serial, ...args], {
    timeout: 10000,
    maxBuffer: 64000,
  });
  if (/\bKO:|Permission denied|Exception|Error:/i.test(stdout + stderr))
    throw new Error("기기에서 설정을 거부했어요.");
  return stdout;
}
export async function readPhoneSettings(serial: string) {
  if (serial !== "emulator-5554")
    return {
      supported: false,
      reason: serial.startsWith("ios:")
        ? "iOS Simulator는 전화번호·유심 설정을 지원하지 않아요. 앱의 테스트용 번호 연동이 필요해요."
        : "현재 서버의 Android 에뮬레이터에서만 지원해요.",
    };
  const status = await adb(serial, ["emu", "gsm", "status"]);
  const carrier = await adb(serial, [
    "shell",
    "getprop",
    "gsm.sim.operator.alpha",
  ]);
  return {
    supported: true,
    carrier: carrier.trim(),
    voice: status.match(/voice state:\s*(\w+)/)?.[1] || "",
    network: status.match(/data state:\s*(\w+)/)?.[1] || "",
  };
}
const active = new Set<string>();
export async function updatePhoneSettings(
  serial: string,
  data: Record<string, unknown>,
  authorized: () => boolean,
) {
  const values = phoneSettingsInput(data);
  if (active.has(serial))
    throw new Error("이전 설정 적용이 끝나면 다시 시도해 주세요.");
  active.add(serial);
  try {
    const commands: string[][] = [];
    if (values.phone) commands.push(["emu", "phonenumber", values.phone]);
    if (values.carrier) {
      for (const key of ["gsm.sim.operator.alpha", "gsm.operator.alpha"])
        commands.push(["shell", "su", "0", "setprop", key, values.carrier]);
    }
    if (values.voice) commands.push(["emu", "gsm", "voice", values.voice]);
    if (values.network) commands.push(["emu", "gsm", "data", values.network]);
    for (const command of commands) {
      if (!authorized()) throw new Error("기기를 점유한 창에서 적용해 주세요.");
      await adb(serial, command);
    }
    return { ok: true, ...(await readPhoneSettings(serial)) };
  } finally {
    active.delete(serial);
  }
}
