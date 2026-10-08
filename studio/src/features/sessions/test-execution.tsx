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
import type { Engine, NewSession, Domain } from "../../../../contracts/studio";
export function TestExecution({
  onCreate,
  busy,
  domains,
  embedded = false,
}: {
  onCreate: (v: NewSession) => Promise<unknown>;
  busy: boolean;
  domains: Domain[];
  embedded?: boolean;
}) {
  const fieldId = useId();
  const [name, setName] = useState("이체 입력 확인");
  const [domainId, setDomainId] = useState("");
  const domain = domains.find((d) => d.id === domainId) || domains[0];
  const environment = domain?.environment || "web";
  const selectedEngine: Engine =
    environment === "app" ? "android" : environment === "api" ? "api" : "web";
  return (
    <div className="max-w-2xl space-y-6">
      {!embedded && (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">테스트 실행</h1>
          <p className="text-sm text-muted-foreground">
            실행환경을 고르고 테스트를 시작해요.
          </p>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onCreate({ engine: selectedEngine, name, url: domain?.url });
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor={fieldId + "-name"}>테스트 이름</Label>
          <Input
            id={fieldId + "-name"}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {
          <div className="space-y-2">
            <Label htmlFor={fieldId + "-domain"}>도메인</Label>
            <Select
              value={domain?.id || ""}
              onValueChange={setDomainId}
              disabled={busy || domains.length === 0}
            >
              <SelectTrigger
                id={fieldId + "-domain"}
                variant="multiline"
              >
                <SelectValue placeholder="등록된 도메인이 없어요" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                align="start"
                className="w-(--radix-select-trigger-width)"
              >
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="min-w-0 whitespace-normal">
                      <span className="block">
                        {d.name} ·{" "}
                        {
                          { web: "웹", app: "앱", api: "API" }[
                            d.environment || "web"
                          ]
                        }
                      </span>
                      <span className="block break-all text-xs text-muted-foreground">
                        {d.url}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!domain && (
              <p className="text-xs text-muted-foreground">
                관리자가 도메인을 등록해야 테스트를 시작할 수 있어요.
              </p>
            )}
          </div>
        }
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !domain}>
            {busy ? "준비 중" : "시작"}
            <ArrowRight />
          </Button>
        </div>
      </form>
    </div>
  );
}
