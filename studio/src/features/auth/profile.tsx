import { useState } from "react";
import { UserRound, Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { User } from "../../../../contracts/studio";
export function Profile({
  user,
  busy,
  error,
  onLogin,
  onLogout,
}: {
  user: User | null;
  busy: boolean;
  error: string;
  onLogin: (
    role: User["role"],
    username: string,
    password: string,
  ) => Promise<boolean>;
  onLogout: () => Promise<unknown>;
}) {
  const [role, setRole] = useState<User["role"] | null>(null);
  const [profile, setProfile] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const showLogin = (value: User["role"]) => {
    setUsername(value === "admin" ? "admin" : "tester");
    setPassword("");
    setRole(value);
  };
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {user ? (
          <Button variant="ghost" onClick={() => setProfile(true)}>
            <UserRound />
            <span>{user.name}</span>
            <span className="text-xs text-muted-foreground">
              {user.role === "admin" ? "관리자" : "일반 사용자"}
            </span>
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => showLogin("user")}>
              <UserRound />
              일반 사용자 로그인
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => showLogin("admin")}
            >
              <Shield />
              관리자 로그인
            </Button>
          </>
        )}
      </div>
      <Dialog
        open={!!role}
        onOpenChange={(v) => {
          if (!v) {
            setRole(null);
            setPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {role === "admin" ? "관리자 로그인" : "일반 사용자 로그인"}
            </DialogTitle>
            <DialogDescription>
              헤임달 계정으로 로그인해 주세요.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (role && (await onLogin(role, username, password))) {
                setRole(null);
                setPassword("");
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="login-name">아이디</Label>
              <Input
                id="login-name"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={busy} type="submit">
              {busy ? "로그인 중" : "로그인"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={profile && !!user} onOpenChange={setProfile}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로필</DialogTitle>
            <DialogDescription>
              {user?.name} · {user?.role === "admin" ? "관리자" : "일반 사용자"}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{user?.username}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await onLogout();
              setProfile(false);
            }}
          >
            <LogOut />
            로그아웃
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
