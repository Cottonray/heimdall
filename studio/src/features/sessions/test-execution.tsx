import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Engine, NewSession } from "../../../../contracts/studio";
export function TestExecution({
  onCreate,
  busy,
  embedded = false,
}: {
  onCreate: (v: NewSession) => Promise<unknown>;
  busy: boolean;
  embedded?: boolean;
}) {
  const fieldId = useId();
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<Engine>("web");
  const [url, setUrl] = useState("");
  return (
    <div className="max-w-2xl space-y-6">
      {!embedded && (
        <PageHeader
          title="테스트 실행"
          description="테스트 유형과 대상을 정하고 시작해요."
        />
      )}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void onCreate({
            engine,
            name: name.trim(),
            ...(engine === "android" ? {} : { url: url.trim() }),
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={fieldId + "-name"}>테스트 이름</Label>
          <Input
            id={fieldId + "-name"}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId + "-type"}>테스트 유형</Label>
          <Select
            value={engine}
            onValueChange={(value) => setEngine(value as Engine)}
            disabled={busy}
          >
            <SelectTrigger id={fieldId + "-type"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="android">앱</SelectItem>
              <SelectItem value="web">웹</SelectItem>
              <SelectItem value="api">API</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {engine !== "android" ? (
          <div className="space-y-2">
            <Label htmlFor={fieldId + "-url"}>
              {engine === "api" ? "API 주소" : "웹 주소"}
            </Label>
            <Input
              id={fieldId + "-url"}
              type="url"
              required
              maxLength={2000}
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            연결된 Android 테스트 기기에서 시작해요.
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              busy || !name.trim() || (engine !== "android" && !url.trim())
            }
          >
            {busy ? "준비 중" : "시작"}
            <ArrowRight />
          </Button>
        </div>
      </form>
    </div>
  );
}
