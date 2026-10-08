import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RefreshControl } from "@/components/refresh-control";
import { DeviceManagement } from "./device-management";
import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, LayoutGrid, List } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Item } from "@/components/ui/item";
import { API } from "@/lib/api";
import { APP_ROOT } from "@/lib/paths";
import type { DeviceInfo } from "../../../../contracts/studio";
import { DataTable } from "@/components/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deviceStatus,
  matchesDeviceFilter,
  type DeviceFilter,
} from "./device-status";

export function DeviceFarm({
  active,
  management = false,
}: {
  active: boolean;
  management?: boolean;
}) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("heimdall-device-view") === "list"
        ? "list"
        : "cards";
    } catch {
      return "cards";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("heimdall-device-view", view);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }, [view]);
  const [filter, setFilter] = useState<DeviceFilter>(
    management ? "all" : "available",
  );
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
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [active, revision]);
  const visibleDevices = devices.filter((device) =>
    matchesDeviceFilter(device, filter, !!error),
  );
  const remoteUrl = (device: DeviceInfo) =>
    APP_ROOT + "?" + new URLSearchParams({ device: device.serial });
  return (
    <div className="space-y-8">
      <PageHeader
        title={management ? "기기관리" : "디바이스팜"}
        actions={
          <>
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as DeviceFilter)}
            >
              <SelectTrigger aria-label="디바이스 상태 필터">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">사용가능</SelectItem>
                <SelectItem value="in-use">사용 중</SelectItem>
                <SelectItem value="all">전체</SelectItem>
              </SelectContent>
            </Select>
            {!management && (
              <div
                role="group"
                aria-label="보기 방식"
                className="flex items-center gap-1"
              >
                <Button
                  variant={view === "cards" ? "secondary" : "ghost"}
                  size="icon"
                  aria-label="카드보기"
                  aria-pressed={view === "cards"}
                  onClick={() => setView("cards")}
                >
                  <LayoutGrid />
                </Button>
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="icon"
                  aria-label="목록보기"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <List />
                </Button>
              </div>
            )}
            {management && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">에이전트 다운로드</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>에이전트 다운로드</DialogTitle>
                    <DialogDescription>
                      기기가 연결된 컴퓨터에서 실행하면 이 서버의 디바이스팜에
                      등록돼요.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline">
                        <a href={API + "/admin/agent-download?platform=macos"}>
                          macOS 다운로드 (Apple Silicon · Intel)
                        </a>
                      </Button>
                      <Button variant="outline" disabled>
                        Windows 준비 중
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      동일한 macOS 패키지로 Apple Silicon(arm64)과 Intel(x64)을
                      지원해요. iOS 시뮬레이터용 CLI예요. Node.js · Xcode ·
                      Appium이 필요하며 설치 및 등록 방법은 동봉된 README를
                      확인해 주세요.
                    </p>
                    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
                      <code>
                        heimdall server --master {window.location.origin}
                      </code>
                    </pre>
                    <p className="text-sm text-muted-foreground">
                      폐쇄망에서는 사내 마스터 주소를 입력해 주세요. 실행 전에
                      에이전트 ID·인증 토큰·허용 기기를 등록해야 해요.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <RefreshControl
              busy={loading}
              active={active}
              defaultInterval={3}
              onRefresh={() => setRevision((value) => value + 1)}
            />
          </>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && !devices.length ? (
        <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <span className="sr-only">디바이스를 불러오는 중</span>
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} aria-hidden="true">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="size-6" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-3 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : management ? (
        <DeviceManagement devices={visibleDevices} inventoryError={!!error} />
      ) : view === "list" ? (
        <DataTable
          data={visibleDevices}
          caption="디바이스 목록"
          getRowId={(device) => device.serial}
          getRowLabel={(device) => device.model || device.serial}
          searchText={(device) =>
            `${device.model} ${device.serial} ${device.platform}`
          }
          searchPlaceholder="기기 이름 또는 ID 검색"
          emptyMessage="선택한 상태의 기기가 없어요."
          columns={[
            {
              id: "name",
              header: "기기",
              sortValue: (device) => device.model || device.serial,
              cell: (device) => (
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={device.platform || "android"} />
                  {device.model || device.serial}
                </div>
              ),
            },
            {
              id: "status",
              header: "상태",
              sortValue: (device) => deviceStatus(device, !!error),
              cell: (device) => (
                <Badge
                  variant={
                    deviceStatus(device, !!error) === "오프라인"
                      ? "offline"
                      : deviceStatus(device, !!error) === "사용가능"
                        ? "success"
                        : "outline"
                  }
                >
                  {deviceStatus(device, !!error)}
                </Badge>
              ),
            },
            {
              id: "kind",
              header: "유형",
              cell: (device) =>
                device.kind === "emulator" ? "가상 기기" : "실물 기기",
            },
            { id: "serial", header: "ID", cell: (device) => device.serial },
            {
              id: "open",
              header: "연결",
              cell: (device) =>
                deviceStatus(device, !!error) === "사용가능" ||
                device.ownedByMe ? (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={remoteUrl(device)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${device.model || device.serial} 원격 조작 새 창 열기`}
                    >
                      <ExternalLink />
                      연결
                    </a>
                  </Button>
                ) : (
                  <span className="text-muted-foreground">
                    {deviceStatus(device, !!error)}
                  </span>
                ),
            },
          ]}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleDevices.map((device) => {
            const platform = device.platform || "android";
            const platformName = platform === "ios" ? "iOS" : "Android";
            const virtual = device.kind === "emulator";
            const state = deviceStatus(device, !!error);
            const ready = state === "사용가능" || !!device.ownedByMe;
            const name =
              device.model ||
              `${platformName} ${virtual ? "가상 기기" : "실물 기기"}`;
            const remoteUrl =
              APP_ROOT + "?" + new URLSearchParams({ device: device.serial });
            return (
              <Item
                key={device.serial}
                variant="project"
                size="project"
                asChild
              >
                <a
                  href={ready ? remoteUrl : undefined}
                  aria-disabled={!ready}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    ready ? `${name} 원격 조작 새 창 열기` : `${name} ${state}`
                  }
                >
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <PlatformIcon platform={platform} />
                        <Badge
                          variant={
                            state === "오프라인"
                              ? "offline"
                              : ready
                                ? "success"
                                : "outline"
                          }
                        >
                          {state}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold">{name}</h2>
                        <ExternalLink
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      </div>
                    </div>
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
                  </div>
                </a>
              </Item>
            );
          })}
        </div>
      )}
      {!loading && !error && !visibleDevices.length && view === "cards" && (
        <p className="text-sm text-muted-foreground">
          선택한 상태의 기기가 없어요.
        </p>
      )}
    </div>
  );
}
