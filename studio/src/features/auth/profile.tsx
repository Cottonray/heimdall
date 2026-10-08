import { useState } from "react";
import { UserRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onLogout,
}: {
  user: User | null;
  busy: boolean;
  onLogout: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <UserRound />
        <span>{user.name}</span>
        <span className="text-xs text-muted-foreground">
          {user.role === "admin" ? "관리자" : "일반 사용자"}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로필</DialogTitle>
            <DialogDescription>
              {user.name} · {user.role === "admin" ? "관리자" : "일반 사용자"}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{user.username}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await onLogout();
              setOpen(false);
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
