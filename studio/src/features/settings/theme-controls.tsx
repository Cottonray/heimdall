import { useId } from "react";
import { Moon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Theme, ResolvedTheme } from "./use-theme";
export function ThemeControls({
  theme,
  resolvedTheme,
  onTheme,
}: {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  onTheme: (theme: Theme) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex min-h-9 items-center justify-between gap-3 px-3">
        <Label htmlFor={id + "-dark"}>
          <Moon className="size-4" />
          다크 모드
        </Label>
        <Switch
          id={id + "-dark"}
          checked={resolvedTheme === "dark"}
          onCheckedChange={(dark) => onTheme(dark ? "dark" : "light")}
        />
      </div>
      <div className="flex min-h-9 items-center justify-between gap-2 px-3">
        <Label htmlFor={id + "-system"} variant="subtle">
          시스템 설정 따르기
        </Label>
        <Switch
          id={id + "-system"}
          size="sm"
          checked={theme === "system"}
          onCheckedChange={(system) =>
            onTheme(system ? "system" : resolvedTheme)
          }
        />
      </div>
    </div>
  );
}
