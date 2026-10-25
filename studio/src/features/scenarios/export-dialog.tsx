import { Download } from "@/components/ui/material-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { download } from "@/lib/api";
import type { SessionExport } from "../../../../contracts/studio";
export function ExportDialog({
  data,
  onClose,
}: {
  data: SessionExport | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!data}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>시나리오 내보내기</DialogTitle>
          <DialogDescription>
            {data?.session.engine === "android"
              ? "Appium 테스트 코드과 실행 기록을 저장해요."
              : "Playwright 테스트 코드와 실행 기록을 저장해요."}
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6">
          {data?.code}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              data &&
              download(
                data.code,
                data.session.engine === "android"
                  ? "scenario.appium.ts"
                  : "scenario.spec.ts",
              )
            }
          >
            <Download />
            코드
          </Button>
          <Button
            variant="outline"
            onClick={() => data && download(data.jsonl, "replay.jsonl")}
          >
            JSONL
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              data &&
              download(JSON.stringify(data.session, null, 2), "scenario.json")
            }
          >
            시나리오
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
