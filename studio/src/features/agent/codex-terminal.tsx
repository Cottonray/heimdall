import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Button } from "@/components/ui/button";
const STUDIO_BASE = "/aiqa/studio";

export function CodexTerminal({
  sessionId,
  active,
}: {
  sessionId: string;
  active: boolean;
}) {
  const socket = useRef<WebSocket | null>(null);
  const target = useRef(sessionId);
  target.current = sessionId;
  useEffect(() => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({type:"target",id:sessionId}));
  }, [sessionId]);
  const element = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState("연결 중");
  useEffect(() => {
    if (!active) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      scrollback: 3000,
      theme: { background: "#101820", foreground: "#e6edf3" },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element.current!);
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${STUDIO_BASE}/ws?terminal=${encodeURIComponent(sessionId)}`,
    );
    socket.current = ws;
    const resize = () => {
      if (!element.current?.clientHeight || !element.current.clientWidth)
        return;
      fit.fit();
      if (ws.readyState === WebSocket.OPEN)
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element.current!);
    ws.onopen = () => {
      setStatus("터미널 준비 중");
      resize();
      terminal.focus();
    };
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "ready") { ws.send(JSON.stringify({type:"target",id:target.current})); setStatus("YOLO · 테스트 전용"); resize(); }
        if (message.type === "output") terminal.write(message.data);
        if (message.type === "error") {
          setStatus(message.error);
          terminal.writeln("\r\n" + message.error);
        }
      } catch {
        /* Ignore invalid protocol frames. */
      }
    };
    ws.onclose = () => setStatus("연결 종료");
    const input = terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "input", data }));
    });
    resize();
    return () => {
      observer.disconnect();
      input.dispose();
      socket.current = null;
      ws.close();
      terminal.dispose();
    };
  }, [generation, active]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <span role="status" className="text-xs text-muted-foreground">
          {status}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setStatus("연결 중");
            setGeneration((value) => value + 1);
          }}
        >
          재연결
        </Button>
      </div>
      <div
        ref={element}
        className="min-h-0 flex-1 overflow-hidden"
        aria-label="Codex 대화형 터미널"
      />
    </div>
  );
}
