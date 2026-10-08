/** scrcpy's Annex-B H.264 packets. All frames are released immediately after drawing. */
export function createVideoRenderer(
  canvas: () => HTMLCanvasElement | null,
  rendered: () => void,
  display: (width: number, height: number) => void,
  fallback: () => void,
) {
  let decoder: VideoDecoder | undefined;
  let keyNeeded = true;
  let timestamp = 0;
  let failed = false;
  let config: Uint8Array | undefined;
  const fail = () => {
    if (failed) return;
    failed = true;
    if (decoder?.state !== "closed") decoder?.close();
    fallback();
  };
  return {
    feed(bytes: Uint8Array) {
      if (failed || bytes[0] !== 0x48) return;
      const flags = bytes[1];
      if (flags & 4) {
        if (bytes.length < 10) return fail();
        const data = new DataView(bytes.buffer, bytes.byteOffset + 2, 8);
        display(data.getInt32(0), data.getInt32(4));
        keyNeeded = true;
        return;
      }
      const data = bytes.subarray(2);
      try {
        if (flags & 1) {
          // SPS carries the profile, constraints and level for WebCodecs.
          let sps = -1;
          for (let i = 0; i + 7 < data.length; i++) {
            if (
              data[i] === 0 &&
              data[i + 1] === 0 &&
              data[i + 2] === 1 &&
              (data[i + 3] & 31) === 7
            ) {
              sps = i + 3;
              break;
            }
          }
          if (sps < 0) return fail();
          if (decoder?.state !== "closed") decoder?.close();
          decoder = new VideoDecoder({
            output(frame) {
              try {
                const target = canvas();
                if (!target) return;
                if (
                  target.width !== frame.displayWidth ||
                  target.height !== frame.displayHeight
                ) {
                  target.width = frame.displayWidth;
                  target.height = frame.displayHeight;
                }
                target.getContext("2d")?.drawImage(frame, 0, 0);
                rendered();
              } finally {
                frame.close();
              }
            },
            error: fail,
          });
          const codec =
            "avc1." +
            [...data.subarray(sps + 1, sps + 4)]
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("");
          decoder.configure({ codec, optimizeForLatency: true });
          config = data.slice();
          keyNeeded = true;
          return;
        }
        if (!decoder || decoder.state !== "configured") return;
        const key = !!(flags & 2);
        if (decoder.decodeQueueSize > 3) {
          keyNeeded = true;
          return;
        }
        if (keyNeeded && !key) return;
        if (key) keyNeeded = false;
        const payload =
          key && config ? new Uint8Array([...config, ...data]) : data;
        decoder.decode(
          new EncodedVideoChunk({
            type: key ? "key" : "delta",
            timestamp: (timestamp += 41667),
            data: payload,
          }),
        );
      } catch {
        fail();
      }
    },
    close() {
      failed = true;
      if (decoder?.state !== "closed") decoder?.close();
    },
  };
}
