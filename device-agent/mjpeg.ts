/** Bounded incremental JPEG parser; multipart headers may split across TCP chunks. */
export class JpegParser {
  private buffer: Buffer = Buffer.alloc(0);
  feed(chunk: Uint8Array): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: Buffer[] = [];
    for (;;) {
      const start = this.buffer.indexOf(Buffer.from([255, 216]));
      if (start < 0) {
        this.buffer = this.buffer.subarray(-1);
        break;
      }
      const end = this.buffer.indexOf(Buffer.from([255, 217]), start + 2);
      if (end < 0) {
        this.buffer = this.buffer.subarray(start);
        if (this.buffer.length > 2_000_000)
          throw new Error("MJPEG frame too large");
        break;
      }
      if (end - start <= 500000)
        frames.push(Buffer.from(this.buffer.subarray(start, end + 2)));
      this.buffer = this.buffer.subarray(end + 2);
    }
    return frames;
  }
}

/** One WDA stream, latest frame only. No disk conversion or screenshot RPC queue. */
export class LatestJpeg {
  private controller?: AbortController;
  private latest?: { frame: Buffer; at: number };
  private used = 0;
  private running?: Promise<void>;
  async frame(): Promise<Buffer> {
    this.used = Date.now();
    if (!this.running) {
      this.controller = new AbortController();
      this.running = this.read(this.controller)
        .catch(() => {
          this.latest = undefined;
        })
        .finally(() => {
          this.running = undefined;
        });
    }
    const deadline = Date.now() + 5000;
    while (!this.latest || Date.now() - this.latest.at > 1500) {
      if (!this.running || Date.now() > deadline)
        throw new Error("iOS 영상 연결을 확인해 주세요");
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return this.latest.frame;
  }
  stop() {
    this.controller?.abort();
    this.latest = undefined;
  }
  private async read(controller: AbortController) {
    const idle = setInterval(() => {
      if (Date.now() - this.used > 3000) controller.abort();
    }, 1000);
    try {
      const response = await fetch("http://127.0.0.1:9115", {
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error("WDA MJPEG unavailable");
      const parser = new JpegParser();
      const reader = response.body.getReader();
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        for (const frame of parser.feed(chunk))
          this.latest = { frame, at: Date.now() };
      }
    } finally {
      clearInterval(idle);
      this.latest = undefined;
    }
  }
}
