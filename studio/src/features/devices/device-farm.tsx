import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { API } from "@/lib/api";
import type { DeviceInfo } from "../../../../contracts/studio";

function deviceStatus(device: DeviceInfo, lookupFailed: boolean) {
  if (lookupFailed || device.error) return "상태 확인 불가";
  if (device.state === "unauthorized") return "승인 대기";
  if (device.state === "offline") return "오프라인";
  if (device.state !== "device" || device.ready === undefined)
    return "상태 확인 불가";
  if (!device.ready) return "부팅 중";
  return device.kind === "emulator" ? "실행 중" : "사용 가능";
}

export function DeviceFarm({
  active,
  actions,
}: {
  active: boolean;
  actions?: ReactNode;
}) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const response = await fetch(API + "/devices", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (!response.ok) throw new Error("디바이스 상태를 확인하지 못했어요.");
        const next = (await response.json()) as DeviceInfo[];
        if (!controller.signal.aborted) {
          setDevices(next);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError("디바이스 상태를 확인하지 못했어요.");
      } finally {
        pending = false;
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
  const virtual = devices.filter((device) => device.kind === "emulator").length;
  return (
    <div className="space-y-8">
      <PageHeader
        title="디바이스팜"
        description={
          error
            ? "기기 상태 확인 불가"
            : loading && !devices.length
              ? "기기 확인 중"
              : `가상 ${virtual}대 · 실물 ${devices.length - virtual}대`
        }
        actions={
          <>
            {actions}
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setRevision((n) => n + 1)}
            >
              <RefreshCw />
              새로고침
            </Button>
          </>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && !devices.length ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {devices.map((device) => {
            const platform = device.platform || "android";
            const platformName = platform === "ios" ? "iOS" : "Android";
            const virtual = device.kind === "emulator";
            const state = deviceStatus(device, !!error);
            const ready = state === "실행 중" || state === "사용 가능";
            return (
              <Card key={device.serial}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <PlatformIcon platform={platform} />
                    <Badge variant={ready ? "success" : "outline"}>
                      {state}
                    </Badge>
                  </div>
                  <CardTitle>
                    {device.model ||
                      `${platformName} ${virtual ? "가상 기기" : "실물 기기"}`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {virtual ? "가상 기기" : "실물 기기"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {platformName}
                        {virtual
                          ? platform === "ios"
                            ? " 시뮬레이터"
                            : " 에뮬레이터"
                          : ""}
                      </span>
                    </div>
                    <p
                      data-selectable
                      className="break-all text-xs text-muted-foreground"
                    >
                      ID · {device.serial}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {!loading && !error && !devices.length && (
        <p className="text-sm text-muted-foreground">표시할 기기가 없어요.</p>
      )}
    </div>
  );
}
