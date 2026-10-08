import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "../../../../contracts/studio";

export function UserAvatar({
  user,
  size,
  image = user.avatar,
}: {
  user: User;
  size: "sm" | "profile";
  image?: string | null;
}) {
  const name = user.name.trim() || user.username.trim() || "?";
  const segments = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(name);
  const initial = segments[Symbol.iterator]().next().value?.segment || "?";
  return (
    <Avatar size={size}>
      {image && <AvatarImage src={image} alt="프로필 이미지" />}
      <AvatarFallback seed={user.id}>{initial}</AvatarFallback>
    </Avatar>
  );
}
