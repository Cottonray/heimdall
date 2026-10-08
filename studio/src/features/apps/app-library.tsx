import { useEffect, useState, useRef } from "react";
import { API } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
type App = {
  id: string;
  name: string;
  filename: string;
  size: number;
  created: string;
  platform: string;
};
async function response(res: Response) {
  const data = await res
    .json()
    .catch(() => ({ error: "요청을 처리하지 못했어요" }));
  if (!res.ok) throw new Error(data.error);
  return data;
}
export function AppLibrary({
  management = false,
  serial = "",
  viewerId = "",
  canControl = false,
}: {
  management?: boolean;
  serial?: string;
  viewerId?: string;
  canControl?: boolean;
}) {
  const [apps, setApps] = useState<App[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const refresh = async () =>
    setApps(await fetch(API + "/apps").then(response));
  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message)));
  }, []);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!/\.(apk|zip)$/i.test(file.name) || file.size > 300 * 1024 * 1024)
        throw new Error(
          "300MB 이하 APK 또는 시뮬레이터 앱 ZIP을 선택해 주세요",
        );
      const params = new URLSearchParams({
        filename: file.name,
        size: String(file.size),
      });
      const { id } = await fetch(API + "/apps/upload?" + params, {
        method: "POST",
      }).then(response);
      for (let offset = 0; offset < file.size;) {
        const part = file.slice(offset, offset + 512 * 1024);
        const result = await fetch(
          API +
            "/apps/upload?" +
            new URLSearchParams({ id, offset: String(offset) }),
          { method: "POST", body: part },
        ).then(response);
        offset = result.offset;
        setMessage("업로드 " + Math.round((offset / file.size) * 100) + "%");
      }
      await refresh();
      setMessage("앱을 업로드했어요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드하지 못했어요");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const install = async (app: App) => {
    setBusy(true);
    setError("");
    setMessage(app.name + " 설치 중이에요.");
    try {
      await fetch(
        API +
          "/apps/install?" +
          new URLSearchParams({ id: app.id, serial, viewer: viewerId }),
        { method: "POST" },
      ).then(response);
      setMessage(app.name + " 설치를 완료했어요.");
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "설치하지 못했어요");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {management ? "앱 관리" : "앱 설치"}
        </h1>
        {management && (
          <>
            <Input
              ref={input}
              type="file"
              accept=".apk,.zip"
              className="hidden"
              aria-label="앱 파일 업로드"
              onChange={(e) => void upload(e.target.files?.[0])}
              disabled={busy}
            />
            <Button disabled={busy} onClick={() => input.current?.click()}>
              앱 업로드
            </Button>
          </>
        )}
        {!management && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            새로고침
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {management
          ? "Android APK 또는 iOS 시뮬레이터용 .app을 압축한 ZIP을 업로드해요. 최대 300MB예요."
          : "현재 기기에 맞는 앱을 설치해요. iOS 시뮬레이터는 .app ZIP을 사용해요."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <DataTable
        data={
          management
            ? apps
            : apps.filter(
                (a) =>
                  a.platform ===
                  (serial.startsWith("ios:") ? "ios" : "android"),
              )
        }
        caption="등록 앱"
        getRowId={(a) => a.id}
        getRowLabel={(a) => a.name}
        searchText={(a) => a.name}
        selectable={false}
        columns={[
          {
            id: "name",
            header: "앱",
            sortValue: (a) => a.name,
            cell: (a) => a.name,
          },
          {
            id: "platform",
            header: "환경",
            cell: (a) => (a.platform === "ios" ? "iOS 시뮬레이터" : "Android"),
          },
          {
            id: "size",
            header: "크기",
            sortValue: (a) => a.size,
            cell: (a) => (a.size / 1024 / 1024).toFixed(1) + " MB",
          },
          ...(management
            ? [
                {
                  id: "created",
                  header: "업로드일",
                  sortValue: (a: App) => a.created,
                  cell: (a: App) => new Date(a.created).toLocaleString("ko-KR"),
                },
              ]
            : [
                {
                  id: "install",
                  header: "설치",
                  cell: (a: App) => (
                    <Button
                      size="sm"
                      disabled={busy || !canControl}
                      onClick={() => void install(a)}
                    >
                      설치
                    </Button>
                  ),
                },
              ]),
        ]}
      />
      {!management && !canControl && (
        <p className="text-sm text-muted-foreground">
          기기를 연결하고 점유하면 설치할 수 있어요.
        </p>
      )}
    </section>
  );
}
