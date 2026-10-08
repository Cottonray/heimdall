import { createHash, createHmac } from "node:crypto";

export const MAX_AVATAR_BYTES = 512 * 1024;
const MAX_STORAGE_BYTES = 20 * 1024 * 1024;
export type AvatarImage = { bytes: Buffer; mime: string };
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) =>
  createHmac("sha256", key).update(value).digest();
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
const validDimensions = (width: number, height: number) =>
  width > 0 && height > 0 && width <= 2048 && height <= 2048;
function jpegDimensions(bytes: Buffer) {
  if (
    bytes.length < 4 ||
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    return false;
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length)
      return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    )
      return (
        length >= 8 &&
        validDimensions(
          bytes.readUInt16BE(offset + 5),
          bytes.readUInt16BE(offset + 3),
        )
      );
    offset += length;
  }
  return false;
}
function webpDimensions(bytes: Buffer) {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.toString("ascii", 8, 12) !== "WEBP" ||
    bytes.readUInt32LE(16) > bytes.length - 20
  )
    return false;
  const chunk = bytes.toString("ascii", 12, 16);
  if (
    chunk === "VP8 " &&
    bytes.subarray(23, 26).equals(Buffer.from("9d012a", "hex"))
  )
    return validDimensions(
      bytes.readUInt16LE(26) & 0x3fff,
      bytes.readUInt16LE(28) & 0x3fff,
    );
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return validDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X" && !(bytes[20] & 0x02))
    return validDimensions(
      bytes.readUIntLE(24, 3) + 1,
      bytes.readUIntLE(27, 3) + 1,
    );
  return false;
}

export function decodeAvatar(value: unknown): AvatarImage {
  if (typeof value !== "string" || value.length > MAX_AVATAR_BYTES * 1.4 + 128)
    throw new Error("프로필 이미지는 512KB 이하로 올려 주세요");
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    );
  if (!match) throw new Error("PNG, JPEG, WebP 이미지가 필요해요");
  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_AVATAR_BYTES ||
    bytes.toString("base64") !== match[2]
  )
    throw new Error("이미지 데이터 또는 크기를 확인해 주세요");
  const png =
    bytes.length >= 45 &&
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
    bytes.toString("ascii", 12, 16) === "IHDR" &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(16) <= 2048 &&
    bytes.readUInt32BE(20) > 0 &&
    bytes.readUInt32BE(20) <= 2048 &&
    bytes.subarray(-12).equals(Buffer.from("0000000049454e44ae426082", "hex"));
  const jpeg = jpegDimensions(bytes);
  const webp = webpDimensions(bytes);
  if (!(mime === "image/png" ? png : mime === "image/jpeg" ? jpeg : webp))
    throw new Error("파일 내용이 이미지 형식과 일치하지 않아요");
  return { bytes, mime };
}

function configuration() {
  const account = process.env.R2_ACCOUNT_ID || "";
  const accessKey = process.env.R2_ACCESS_KEY_ID || "";
  const secretKey = process.env.R2_SECRET_ACCESS_KEY || "";
  const bucket = process.env.R2_BUCKET || "example-media";
  const prefix = process.env.R2_KEY_PREFIX || "heimdall";
  if (
    !/^[a-f0-9]{32}$/.test(account) ||
    !accessKey ||
    !secretKey ||
    bucket !== "example-media" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(prefix)
  )
    return null;
  return {
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    accessKey,
    secretKey,
    bucket,
    prefix,
  };
}
export const avatarStorageAvailable = () => !!configuration();

export function signStorageRequest(
  method: string,
  url: URL,
  bytes: Buffer,
  mime: string | undefined,
  accessKey: string,
  secretKey: string,
  now = new Date(),
) {
  const date = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const payloadHash = digest(bytes);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": date,
    ...(mime ? { "content-type": mime } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonical = [
    method,
    url.pathname,
    [...url.searchParams]
      .map(([key, value]) => [encode(key), encode(value)])
      .sort(([ak, av], [bk, bv]) =>
        ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1,
      )
      .map(([key, value]) => `${key}=${value}`)
      .join("&"),
    names.map((name) => `${name}:${headers[name].trim()}\n`).join(""),
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${date.slice(0, 8)}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    scope,
    digest(canonical),
  ].join("\n");
  let key = hmac("AWS4" + secretKey, date.slice(0, 8));
  for (const part of ["auto", "s3", "aws4_request"]) key = hmac(key, part);
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${hmac(key, stringToSign).toString("hex")}`;
  return headers;
}

async function request(
  method: string,
  key: string,
  image?: AvatarImage,
  query?: URLSearchParams,
) {
  const config = configuration();
  if (!config) throw new Error("프로필 이미지 저장소가 설정되지 않았어요");
  const url = new URL(
    config.endpoint +
      "/" +
      config.bucket +
      "/" +
      key.split("/").map(encode).join("/"),
  );
  if (query) url.search = query.toString();
  const bytes = image?.bytes || Buffer.alloc(0);
  const response = await fetch(url, {
    method,
    headers: signStorageRequest(
      method,
      url,
      bytes,
      image?.mime,
      config.accessKey,
      config.secretKey,
    ),
    ...(method === "PUT" ? { body: new Uint8Array(bytes) } : {}),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok && response.status !== 404)
    throw new Error("프로필 이미지 저장소에 연결하지 못했어요");
  return response;
}

export function avatarKey(userId: string, version: string) {
  const config = configuration();
  if (!config) throw new Error("프로필 이미지 저장소가 설정되지 않았어요");
  return `${config.prefix}/avatars/${digest(userId)}/${version}`;
}
function checkKey(key: string) {
  const config = configuration();
  if (
    !config ||
    !key.startsWith(config.prefix + "/avatars/") ||
    key.includes("..")
  )
    throw new Error("프로필 이미지 경로를 확인해 주세요");
}

export async function enforceAvatarBudget(bytes: number) {
  const config = configuration();
  if (!config) throw new Error("프로필 이미지 저장소가 설정되지 않았어요");
  let size = 0;
  let token = "";
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({
      "list-type": "2",
      prefix: config.prefix + "/avatars/",
    });
    if (token) query.set("continuation-token", token);
    const response = await request("GET", "", undefined, query);
    if (!response.ok) throw new Error("이미지 저장 용량을 확인하지 못했어요");
    const xml = await response.text();
    if (!xml.includes("<ListBucketResult"))
      throw new Error("이미지 저장 용량을 확인하지 못했어요");
    for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g))
      size += Number(match[1]);
    if (size + bytes > MAX_STORAGE_BYTES)
      throw new Error("프로필 이미지 저장 한도에 도달했어요");
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) return;
    token =
      /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(
        xml,
      )?.[1] || "";
    token = token
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (!token) break;
  }
  throw new Error("이미지 저장 용량을 확인하지 못했어요");
}
export async function putAvatar(key: string, image: AvatarImage) {
  checkKey(key);
  const response = await request("PUT", key, image);
  if (!response.ok) throw new Error("프로필 이미지를 저장하지 못했어요");
}
export async function deleteAvatar(key: string) {
  checkKey(key);
  await request("DELETE", key);
}
export async function getAvatar(key: string) {
  checkKey(key);
  const response = await request("GET", key);
  if (response.status === 404) return null;
  const mime = response.headers.get("content-type")?.split(";")[0] || "";
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(mime) ||
    Number(response.headers.get("content-length")) > MAX_AVATAR_BYTES
  )
    throw new Error("프로필 이미지 형식을 확인해 주세요");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_AVATAR_BYTES)
    throw new Error("프로필 이미지가 너무 커요");
  return { bytes, mime };
}
