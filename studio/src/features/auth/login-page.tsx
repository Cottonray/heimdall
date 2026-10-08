import { useState } from "react";
import { UserRound, Shield, ArrowRight, Sun, Moon } from "lucide-react";
import { HeimdallWordmark } from "@/components/heimdall-wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { APP_ROOT } from "@/lib/paths";
import type { ResolvedTheme } from "@/features/settings/use-theme";
import type { User } from "../../../../contracts/studio";
export function LoginPage({
  busy,
  error,
  theme,
  onToggleTheme,
  onLogin,
  onTestLogin,
}: {
  busy: boolean;
  error: string;
  theme: ResolvedTheme;
  onToggleTheme: () => void;
  onLogin: (name: string, password: string) => Promise<unknown>;
  onTestLogin: (role: User["role"]) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-5">
        <a href={APP_ROOT} className="flex items-center">
          <HeimdallWordmark />
        </a>
        <Button
          variant="ghost"
          size="icon"
          aria-label={theme === "dark" ? "라이트 모드" : "다크 모드"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="mb-8">
            <p className="mb-3 text-sm font-medium text-primary">heimdall</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              헤임달에 로그인
            </h1>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>로그인</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await onLogin(name, password);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="login-name">아이디</Label>
                  <Input
                    id="login-name"
                    autoComplete="username"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">비밀번호</Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={busy} type="submit">
                  {busy ? "로그인 중" : "로그인"}
                  <ArrowRight />
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onTestLogin("user")}
            >
              <UserRound />
              (테스트용) 일반 사용자 로그인
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onTestLogin("admin")}
            >
              <Shield />
              (테스트용) 관리자 로그인
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
