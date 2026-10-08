import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { API } from "@/lib/api";
import type { DeviceInfo } from "../../../../contracts/studio";
import { deviceStatus } from "./device-status";
type Metadata = {
  serial: string;
  name: string;
  notes: string;
  updated?: number;
};
export function DeviceManagement({
  devices,
  inventoryError,
}: {
  devices: DeviceInfo[];
  inventoryError: boolean;
}) {
  const [metadata, setMetadata] = useState<Metadata[]>([]);
  const [editing, setEditing] = useState<Metadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(API + "/admin/device-metadata", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Metadata[]>;
      })
      .then((data) => {
        setMetadata(data);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("관리 정보를 불러오지 못했어요. 화면을 다시 열어 주세요.");
      });
    return () => controller.abort();
  }, []);
  const rows = devices.map((device) => ({
    ...device,
    ...metadata.find((m) => m.serial === device.serial),
  }));
  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const response = await fetch(API + "/admin/device-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!response.ok) throw new Error();
      setMetadata((items) => [
        ...items.filter((m) => m.serial !== editing.serial),
        editing,
      ]);
      setEditing(null);
      setError("");
    } catch {
      setError("기기 정보를 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DataTable
        data={rows}
        caption="기기 관리 목록"
        getRowId={(d) => d.serial}
        getRowLabel={(d) => d.name || d.model || d.serial}
        searchText={(d) =>
          `${d.name || ""} ${d.model} ${d.serial} ${d.notes || ""} ${d.platform}`
        }
        searchPlaceholder="기기명 · ID · 메모 검색"
        columns={[
          {
            id: "name",
            header: "표시 이름",
            sortValue: (d) => d.name || d.model || d.serial,
            cell: (d) => d.name || d.model || d.serial,
          },
          { id: "model", header: "모델", cell: (d) => d.model || "—" },
          {
            id: "platform",
            header: "플랫폼",
            cell: (d) => (d.platform === "ios" ? "iOS" : "Android"),
          },
          {
            id: "kind",
            header: "기기 유형",
            cell: (d) => (d.kind === "emulator" ? "가상 기기" : "실물 기기"),
          },
          { id: "serial", header: "기기 ID", cell: (d) => d.serial },
          {
            id: "status",
            header: "상태",
            cell: (d) => deviceStatus(d, inventoryError),
          },
          { id: "notes", header: "관리 메모", cell: (d) => d.notes || "—" },
          {
            id: "edit",
            header: "관리",
            cell: (d) => (
              <Button
                variant="outline"
                size="sm"
                disabled={!loaded}
                onClick={() =>
                  setEditing({
                    serial: d.serial,
                    name: d.name || "",
                    notes: d.notes || "",
                  })
                }
              >
                수정
              </Button>
            ),
          },
        ]}
      />
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기기 정보</DialogTitle>
            <DialogDescription>
              표시 이름과 관리 메모를 저장해요. 모델·플랫폼·기기 ID는 연결된
              기기에서 가져와요.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="device-id">기기 ID</Label>
                <Input id="device-id" value={editing.serial} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="device-name">표시 이름</Label>
                <Input
                  id="device-name"
                  maxLength={120}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="device-notes">관리 메모</Label>
                <Textarea
                  id="device-notes"
                  maxLength={2000}
                  value={editing.notes}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  저장
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
