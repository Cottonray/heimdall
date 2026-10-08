import { useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { API } from "@/lib/api";
import type { DeviceInfo } from "../../../../contracts/studio";

export function DeviceFarm({ active }: { active: boolean }) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(API + "/devices", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("디바이스 목록을 불러오지 못했어요.");
        const next = (await response.json()) as DeviceInfo[];
        if (!controller.signal.aborted) setDevices(next);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [active, revision]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">디바이스팜</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {devices.filter((d) => d.state === "device").length}대 연결
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw />
          새로고침
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && !devices.length ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {devices.map((device) => (
            <Card key={device.serial}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <Smartphone className="size-5 text-primary" />
                  <Badge
                    variant={
                      device.state === "device" ? "secondary" : "outline"
                    }
                  >
                    {device.state === "device"
                      ? "연결됨"
                      : device.state === "unauthorized"
                        ? "연결 승인 대기"
                        : "오프라인"}
                  </Badge>
                </div>
                <CardTitle>{device.model || device.serial}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    {device.kind === "emulator"
                      ? "Android 에뮬레이터"
                      : "Android 기기"}
                  </p>
                  <p data-selectable>{device.serial}</p>
                  {device.current && (
                    <Badge variant="outline">현재 테스트 기기</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!loading && !error && !devices.length && (
        <p className="text-sm text-muted-foreground">
          연결된 디바이스가 없어요.
        </p>
      )}
    </div>
  );
}
