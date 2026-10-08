import { useState } from "react";
import { Monitor, Smartphone, Braces, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engines } from "@/lib/labels";
import type { Engine, NewSession, Domain } from "../../../../contracts/studio";
export function NewSessionDialog({
  open,
  onOpenChange,
  onCreate,
  busy,
  domains,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (v: NewSession) => Promise<unknown>;
  busy: boolean;
  domains: Domain[];
}) {
  const [engine, setEngine] = useState<Engine>("web");
  const [name, setName] = useState("이체 입력 확인");
  const [domainId, setDomainId] = useState("");
  const domain = domains.find((d) => d.id === domainId) || domains[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 테스트</DialogTitle>
          <DialogDescription>
            실행 환경을 고르고 테스트를 시작해요.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onCreate({ engine, name, url: domain?.url });
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(engines) as Engine[]).map((key) => {
              const Icon =
                key === "android" || key === "mobile-web"
                  ? Smartphone
                  : key === "api"
                    ? Braces
                    : Monitor;
              return (
                <Button
                  key={key}
                  variant={engine === key ? "default" : "outline"}
                  onClick={() => setEngine(key)}
                  aria-pressed={engine === key}
                  type="button"
                >
                  <Icon />
                  {engines[key].label}
                </Button>
              );
            })}
          </div>
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
              <Label>도메인</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {domains.map((d) => (
                  <Button
                    key={d.id}
                    type="button"
                    variant={domain?.id === d.id ? "secondary" : "outline"}
                    aria-pressed={domain?.id === d.id}
                    className="w-full justify-start"
                    onClick={() => setDomainId(d.id)}
                  >
                    {d.name}
                  </Button>
                ))}
              </div>
              <p className="break-all text-xs text-muted-foreground">
                {domain?.url ||
                  "관리자가 도메인을 등록해야 테스트를 시작할 수 있어요."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={busy || (engine !== "android" && !domain)}
            >
              {busy ? "준비 중" : "시작"}
              <ArrowRight />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
