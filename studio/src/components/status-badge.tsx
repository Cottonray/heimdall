import { Badge } from "@/components/ui/badge";
import { states } from "@/lib/labels";
import type { SessionState } from "../../../contracts/studio";
export function StatusBadge({ state }: { state: SessionState }) {
  return (
    <Badge
      variant={
        state === "passed"
          ? "success"
          : state === "ai" || state === "replay"
            ? "default"
            : "secondary"
      }
    >
      {states[state]}
    </Badge>
  );
}
