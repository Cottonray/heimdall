import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Monitor, Smartphone, Braces, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engines } from "@/lib/labels";
import type { Engine, NewSession, Domain } from "../../../../contracts/studio";
export function TestExecution({
  onCreate,
  busy,
  domains,
}: {
  onCreate: (v: NewSession) => Promise<unknown>;
  busy: boolean;
  domains: Domain[];
}) {
  const [engine, setEngine] = useState<Engine>("web");
  const [name, setName] = useState("이체 입력 확인");
  const [domainId, setDomainId] = useState("");
  const domain = domains.find((d) => d.id === domainId) || domains[0];
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">테스트 실행</h1>
        <p className="text-sm text-muted-foreground">
          실행환경을 고르고 테스트를 시작해요.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onCreate({ engine, name, url: domain?.url });
        }}
        className="space-y-5"
      >
        <div className="grid grid-cols-3 gap-2">
          {(["web", "android", "api"] as Engine[]).map((key) => {
            const Icon =
              key === "android" || key === "mobile-web"
                ? Smartphone
                : key === "api"
                  ? Braces
                  : Monitor;
            return (
              <Button
                key={key}
                variant={
                  engine === key || (key === "web" && engine === "mobile-web")
                    ? "default"
                    : "outline"
                }
                onClick={() => setEngine(key)}
                aria-pressed={
                  engine === key || (key === "web" && engine === "mobile-web")
                }
                type="button"
              >
                <Icon />
                {engines[key].label}
              </Button>
            );
          })}
        </div>
        {(engine === "web" || engine === "mobile-web") && (
          <div className="space-y-2">
            <Label>웹 화면</Label>
            <div className="flex gap-2" role="group" aria-label="웹 화면">
              <Button
                type="button"
                variant={engine === "web" ? "secondary" : "outline"}
                aria-pressed={engine === "web"}
                onClick={() => setEngine("web")}
              >
                데스크톱
              </Button>
              <Button
                type="button"
                variant={engine === "mobile-web" ? "secondary" : "outline"}
                aria-pressed={engine === "mobile-web"}
                onClick={() => setEngine("mobile-web")}
              >
                모바일
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="test-name">테스트 이름</Label>
          <Input
            id="test-name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {engine !== "android" && (
          <div className="space-y-2">
            <Label htmlFor="test-domain">도메인</Label>
            <Select
              value={domain?.id || ""}
              onValueChange={setDomainId}
              disabled={busy || domains.length === 0}
            >
              <SelectTrigger
                id="test-domain"
                className="w-full"
                aria-describedby="test-domain-address"
              >
                <SelectValue placeholder="등록된 도메인이 없어요" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p
              id="test-domain-address"
              className="break-all text-xs text-muted-foreground"
            >
              {domain?.url ||
                "관리자가 도메인을 등록해야 테스트를 시작할 수 있어요."}
            </p>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={busy || (engine !== "android" && !domain)}
          >
            {busy ? "준비 중" : "시작"}
            <ArrowRight />
          </Button>
        </div>
      </form>
    </div>
  );
}
