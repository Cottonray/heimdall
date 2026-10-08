import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "./user-avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProfileEditor } from "./profile-editor";
import type { ProfileActionResult } from "@/lib/api";
import type { User } from "../../../../contracts/studio";

export function Profile({
  user,
  busy,
  onLogout,
  onSaveAvatar,
  onChangePassword,
}: {
  user: User | null;
  busy: boolean;
  onLogout: () => Promise<unknown>;
  onSaveAvatar: (avatar: string | null) => Promise<ProfileActionResult>;
  onChangePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<ProfileActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  if (!user) return null;
  const locked = busy || pending;
  const role = user.role === "admin" ? "관리자" : "일반 사용자";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          disabled={locked}
          onClick={() => setOpen(true)}
          aria-label={user.name + " 프로필 · " + role}
        >
          <UserAvatar user={user} size="sm" />
          <span>{user.name}</span>
          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
            {role}
          </Badge>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => void onLogout()}
        >
          <LogOut />
          로그아웃
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!locked) setOpen(next);
        }}
      >
        <DialogContent
          className="max-h-dvh overflow-y-auto"
          showCloseButton={!locked}
        >
          <DialogHeader>
            <DialogTitle>프로필</DialogTitle>
            <DialogDescription>
              {user.name} · {user.username}
            </DialogDescription>
          </DialogHeader>
          <ProfileEditor
            key={user.id}
            user={user}
            locked={locked}
            onPending={setPending}
            onSaveAvatar={onSaveAvatar}
            onChangePassword={onChangePassword}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
