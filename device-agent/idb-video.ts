import type { ClientHttp2Session, ClientHttp2Stream } from "node:http2";
import { setTimeout as delay } from "node:timers/promises";
import { JpegParser } from "./mjpeg.ts";

/** Length-delimited field from idb VideoStreamResponse / Payload protobufs. */
function field2(message: Buffer): Buffer | undefined {
  let offset = 0;
  const varint = () => {
    let value = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      if (offset >= message.length) throw new Error("Truncated protobuf");
      const byte = message[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
    }
    throw new Error("Oversized protobuf integer");
  };
  while (offset < message.length) {
    const tag = varint();
    const wire = tag & 7;
    if (wire === 2) {
      const length = varint();
      if (offset + length > message.length)
        throw new Error("Truncated protobuf bytes");
      const value = message.subarray(offset, offset + length);
      if (tag >>> 3 === 2) return value;
      offset += length;
    } else if (wire === 0) varint();
    else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw new Error("Unsupported protobuf field");
    if (offset > message.length) throw new Error("Truncated protobuf field");
  }
  return undefined;
}
export class IdbVideoParser {
  private pending: Buffer = Buffer.alloc(0);
  private jpeg = new JpegParser();
  feed(chunk: Buffer): Buffer[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const result: Buffer[] = [];
    while (this.pending.length >= 5) {
      const length = this.pending.readUInt32BE(1);
      if (this.pending[0] !== 0 || length > 1000000)
        throw new Error("Invalid idb video frame");
      if (this.pending.length < length + 5) break;
      const payload = field2(this.pending.subarray(5, length + 5));
      const data = payload && field2(payload);
      if (data) result.push(...this.jpeg.feed(data));
      this.pending = this.pending.subarray(length + 5);
    }
    return result;
  }
}

/** Direct Simulator framebuffer stream, without XCTest screenshot RPC. */
export class IdbVideo {
  private request?: ClientHttp2Stream;
  private latest?: { frame: Buffer; at: number };
  private used = 0;
  private idle?: ReturnType<typeof setInterval>;
  async frame(client: ClientHttp2Session, start: Buffer): Promise<Buffer> {
    this.used = Date.now();
    if (!this.request) {
      const request = client.request({
        ":method": "POST",
        ":path": "/idb.CompanionService/video_stream",
        "content-type": "application/grpc",
        te: "trailers",
      });
      this.request = request;
      const parser = new IdbVideoParser();
      request.on("data", (data: Buffer) => {
        try {
          for (const frame of parser.feed(data))
            this.latest = { frame, at: Date.now() };
        } catch {
          this.stop();
        }
      });
      const ended = () => {
        if (this.request === request) this.stop();
      };
      request.on("error", ended);
      request.on("end", ended);
      request.on("close", ended);
      this.idle = setInterval(() => {
        if (Date.now() - this.used > 3000) this.stop();
      }, 1000);
      request.write(start);
    }
    const deadline = Date.now() + 5000;
    while (!this.latest || Date.now() - this.latest.at > 1000) {
      if (!this.request || Date.now() > deadline)
        throw new Error("Simulator video unavailable");
      await delay(10);
    }
    return this.latest.frame;
  }
  stop() {
    const request = this.request;
    this.request = undefined;
    this.latest = undefined;
    clearInterval(this.idle);
    request?.close();
  }
}
