import { useEffect, useRef, useState, type RefObject } from "react";

function save(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `heimdall-${new Date().toISOString().replaceAll(":", "-")}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function useScreenCapture(
  image: RefObject<HTMLImageElement | null>,
  connected: boolean,
) {
  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const cleanup = useRef<() => void>(() => {});
  function canvas() {
    const source = image.current;
    if (!source?.naturalWidth) throw new Error("기기 화면을 기다려 주세요.");
    const target = document.createElement("canvas");
    target.width = source.naturalWidth;
    target.height = source.naturalHeight;
    target.getContext("2d")!.drawImage(source, 0, 0);
    return target;
  }
  function capture() {
    try {
      canvas().toBlob((blob) => {
        if (blob) save(blob, "png");
      }, "image/png");
      setError("");
    } catch {
      setError("화면을 캡처하지 못했어요.");
    }
  }
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  function start() {
    if (recorder.current) return;
    try {
      const target = canvas();
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("녹화를 지원하지 않는 브라우저예요.");
      const stream = target.captureStream(15);
      const next = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });
      const chunks: Blob[] = [];
      let bytes = 0;
      const draw = setInterval(() => {
        const source = image.current;
        if (source?.naturalWidth)
          target
            .getContext("2d")!
            .drawImage(source, 0, 0, target.width, target.height);
      }, 67);
      const limit = setTimeout(() => next.stop(), 180000);
      cleanup.current = () => {
        clearInterval(draw);
        clearTimeout(limit);
        stream.getTracks().forEach((track) => track.stop());
      };
      next.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
        }
        if (bytes >= 100000000 && next.state === "recording") next.stop();
      };
      next.onstop = () => {
        cleanup.current();
        recorder.current = null;
        setRecording(false);
        if (chunks.length)
          save(
            new Blob(chunks, { type: mimeType }),
            mimeType.includes("mp4") ? "mp4" : "webm",
          );
      };
      next.onerror = () => {
        setError("녹화 중 오류가 발생했어요.");
        stop();
      };
      recorder.current = next;
      next.start(1000);
      setRecording(true);
      setError("");
    } catch (cause) {
      cleanup.current();
      setError(
        cause instanceof Error ? cause.message : "녹화를 시작하지 못했어요.",
      );
    }
  }
  useEffect(() => {
    if (!connected) {
      const current = recorder.current;
      if (current?.state === "recording") current.stop();
    }
  }, [connected]);
  useEffect(
    () => () => {
      const current = recorder.current;
      if (current) {
        current.onstop = null;
        if (current.state === "recording") current.stop();
      }
      cleanup.current();
    },
    [],
  );
  return { capture, start, stop, recording, error };
}
