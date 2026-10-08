export type DisplaySize = { width: number; height: number };

export const REMOTE_KEYS = {
  home: "KEYCODE_HOME",
  back: "KEYCODE_BACK",
  recent: "KEYCODE_APP_SWITCH",
  enter: "KEYCODE_ENTER",
  del: "KEYCODE_DEL",
  tab: "KEYCODE_TAB",
  volume_up: "KEYCODE_VOLUME_UP",
  volume_down: "KEYCODE_VOLUME_DOWN",
  power: "KEYCODE_POWER",
} as const;

export type RemoteAction =
  | { type: "tap"; x: number; y: number }
  | {
      type: "swipe";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ms: number;
    }
  | { type: "key"; key: keyof typeof REMOTE_KEYS }
  | { type: "text"; text: string };

function coordinate(value: unknown, limit: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value >= limit
  )
    throw new Error("화면 안의 위치를 선택해 주세요");
  return Math.min(limit - 1, Math.round(value));
}

/** Only the four remote input operations can reach ADB; shell commands never do. */
export function remoteAction(value: unknown, size: DisplaySize): RemoteAction {
  if (!value || typeof value !== "object")
    throw new Error("올바른 조작을 선택해 주세요");
  const action = value as Record<string, unknown>;
  switch (action.type) {
    case "tap":
      return {
        type: "tap",
        x: coordinate(action.x, size.width),
        y: coordinate(action.y, size.height),
      };
    case "swipe": {
      const ms = action.ms ?? 350;
      if (
        typeof ms !== "number" ||
        !Number.isFinite(ms) ||
        ms < 80 ||
        ms > 2000
      )
        throw new Error("스와이프 시간을 확인해 주세요");
      return {
        type: "swipe",
        x1: coordinate(action.x1, size.width),
        y1: coordinate(action.y1, size.height),
        x2: coordinate(action.x2, size.width),
        y2: coordinate(action.y2, size.height),
        ms: Math.round(ms),
      };
    }
    case "key":
      if (
        typeof action.key !== "string" ||
        !Object.hasOwn(REMOTE_KEYS, action.key)
      )
        throw new Error("지원하지 않는 키예요");
      return { type: "key", key: action.key as keyof typeof REMOTE_KEYS };
    case "text":
      if (
        typeof action.text !== "string" ||
        !action.text.length ||
        action.text.length > 1000 ||
        /[\u0000-\u001f\u007f]/u.test(action.text)
      )
        throw new Error("입력할 글자는 1~1,000자로 적어 주세요");
      return { type: "text", text: action.text };
    default:
      throw new Error("지원하지 않는 조작이에요");
  }
}

/** JPEGs are scaled to 360px; use their orientation with the physical display size. */
export function displayFromJpeg(
  jpeg: Buffer,
  native: DisplaySize,
): DisplaySize {
  if (jpeg.length < 4 || jpeg.readUInt16BE(0) !== 0xffd8) return native;
  for (let offset = 2; offset + 4 < jpeg.length;) {
    if (jpeg[offset] !== 0xff) return native;
    const marker = jpeg[offset + 1];
    if (marker === 0xda || marker === 0xd9) return native;
    const length = jpeg.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > jpeg.length) return native;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      const height = jpeg.readUInt16BE(offset + 5),
        width = jpeg.readUInt16BE(offset + 7);
      if (!width || !height) return native;
      return width > height === native.width > native.height
        ? native
        : { width: native.height, height: native.width };
    }
    offset += length + 2;
  }
  return native;
}
