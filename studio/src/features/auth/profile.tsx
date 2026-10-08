import { ChevronDown, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "./user-avatar";
import type { User } from "../../../../contracts/studio";

export function Profile({
  user,
  busy,
  onLogout,
  onSettings,
}: {
  user: User | null;
  busy: boolean;
  onLogout: () => Promise<unknown>;
  onSettings: () => void;
}) {
  if (!user) return null;
  const role = user.role === "admin" ? "관리자" : "일반 사용자";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          disabled={busy}
          aria-label={user.name + " 프로필 · " + role}
        >
          <UserAvatar user={user} size="sm" />
          <span>{user.name}</span>
          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
            {role}
          </Badge>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onSettings}>
          <Settings />
          설정
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => void onLogout()}>
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
