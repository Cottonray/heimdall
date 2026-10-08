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
import type { Engine, NewSession } from "../../../../contracts/studio";
export function NewSessionDialog({
  open,
  onOpenChange,
  onCreate,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (v: NewSession) => Promise<unknown>;
  busy: boolean;
}) {
  const [engine, setEngine] = useState<Engine>("web");
  const [name, setName] = useState("이체 입력 확인");
  const [url, setUrl] = useState("http://127.0.0.1:8081/demo/");
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
            void onCreate({ engine, name, url });
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
              <Label htmlFor="test-url">테스트 주소</Label>
              <Input
                id="test-url"
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                등록된 테스트 주소만 연결할 수 있어요.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "준비 중" : "시작"}
              <ArrowRight />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
