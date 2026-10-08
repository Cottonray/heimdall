import { Monitor, Moon, Sun } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Theme } from "./use-theme";

export function ThemeControls({
  theme,
  onTheme,
}: {
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  return (
    <Select
      value={theme}
      onValueChange={(value) => {
        if (value === "light" || value === "dark" || value === "system") {
          onTheme(value);
        }
      }}
    >
      <SelectTrigger aria-label="화면 테마" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value="light">
          <Sun />
          라이트 모드
        </SelectItem>
        <SelectItem value="dark">
          <Moon />
          다크 모드
        </SelectItem>
        <SelectItem value="system">
          <Monitor />
          시스템 설정 따르기
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
