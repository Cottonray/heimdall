import { useId, useRef, useState } from "react";
import { Check, LockKeyhole, Trash2, Camera } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "./user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { prepareAvatar } from "./avatar-image";
import type { ProfileActionResult } from "@/lib/api";
import type { User } from "../../../../contracts/studio";

type Feedback = { error: boolean; message: string } | null;

export function ProfileEditor({
  user,
  locked,
  onPending,
  onSaveAvatar,
  onChangePassword,
}: {
  user: User;
  locked: boolean;
  onPending: (pending: boolean) => void;
  onSaveAvatar: (avatar: string | null) => Promise<ProfileActionResult>;
  onChangePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<ProfileActionResult>;
}) {
  const id = useId();
  const pending = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const run = async (operation: () => Promise<void>) => {
    if (locked || pending.current) return;
    pending.current = true;
    onPending(true);
    setFeedback(null);
    try {
      await operation();
    } catch (error) {
      setFeedback({
        error: true,
        message:
          error instanceof Error
            ? error.message
            : "변경하지 못했어요. 다시 시도해 주세요.",
      });
    } finally {
      pending.current = false;
      onPending(false);
    }
  };
  const saveAvatar = (avatar: string | null) =>
    run(async () => {
      const result = await onSaveAvatar(avatar);
      if (!result.ok)
        throw new Error(result.error || "이미지를 저장하지 못했어요.");
      setFeedback({
        error: false,
        message: avatar
          ? "프로필 이미지를 저장했어요."
          : "프로필 이미지를 삭제했어요.",
      });
    });
  return (
    <div className="space-y-6" aria-busy={locked}>
      <div className="space-y-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="avatar"
              disabled={locked}
              aria-label="프로필 이미지 변경"
            >
              <UserAvatar user={user} size="profile" />
              <Camera />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={!user.avatarUploadAllowed || locked}
              onSelect={() => fileInput.current?.click()}
            >
              이미지 변경
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!user.avatar || locked}
              onSelect={() => void saveAvatar(null)}
            >
              <Trash2 />
              이미지 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          ref={fileInput}
          hidden
          className="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="프로필 이미지 파일"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file)
              void run(async () => {
                const avatar = await prepareAvatar(file);
                const result = await onSaveAvatar(avatar);
                if (!result.ok)
                  throw new Error(
                    result.error || "이미지를 저장하지 못했어요.",
                  );
                setFeedback({
                  error: false,
                  message: "프로필 이미지를 저장했어요.",
                });
              });
          }}
        />
        <p className="text-xs text-muted-foreground">
          이미지를 눌러 변경하거나 삭제해요.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={id + "-username"}>아이디</Label>
          <Input id={id + "-username"} value={user.username} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id + "-name"}>이름</Label>
          <Input id={id + "-name"} value={user.name} disabled />
        </div>
      </div>
      <Separator />
      {user.passwordChangeAllowed ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (newPassword !== confirmation)
                throw new Error("새 비밀번호가 일치하지 않아요.");
              const result = await onChangePassword(
                currentPassword,
                newPassword,
              );
              if (!result.ok)
                throw new Error(
                  result.error || "비밀번호를 변경하지 못했어요.",
                );
              setCurrentPassword("");
              setNewPassword("");
              setConfirmation("");
              setFeedback({ error: false, message: "비밀번호를 변경했어요." });
            });
          }}
        >
          <fieldset disabled={locked} className="space-y-4">
            <legend className="mb-4 text-sm font-semibold">
              비밀번호 변경
            </legend>
            <div className="space-y-2">
              <Label htmlFor={id + "-current-password"}>현재 비밀번호</Label>
              <Input
                id={id + "-current-password"}
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + "-new-password"}>새 비밀번호</Label>
              <Input
                id={id + "-new-password"}
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
                aria-describedby={id + "-password-help"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p
                id={id + "-password-help"}
                className="text-xs text-muted-foreground"
              >
                12자 이상 입력해 주세요.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + "-confirm-password"}>새 비밀번호 확인</Label>
              <Input
                id={id + "-confirm-password"}
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={locked}>
              <LockKeyhole />
              비밀번호 변경
            </Button>
          </fieldset>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          테스트용 계정은 비밀번호를 변경할 수 없어요.
        </p>
      )}
      {feedback &&
        (feedback.error ? (
          <p role="alert" className="text-sm text-destructive">
            {feedback.message}
          </p>
        ) : (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-success"
          >
            <Check className="size-4" />
            {feedback.message}
          </p>
        ))}
    </div>
  );
}
