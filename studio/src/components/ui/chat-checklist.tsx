import { Check, Circle, AlertCircle } from "./material-icons";
import type { ChatCheck } from "../../../../contracts/studio";

const labels = { pending: "대기", running: "진행 중", done: "완료", blocked: "중단", skipped: "소스 없음" };
export function ChatChecklist({ items }: { items: ChatCheck[] }) {
  return <ul aria-label="시나리오 검증 목록" className="mt-3 space-y-2">
    {items.map((item, index) => <li key={index} className="flex items-center gap-2">
      <span aria-hidden="true" className={item.status === "done"
        ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-white"
        : "flex size-5 shrink-0 items-center justify-center text-muted-foreground"}>
        {item.status === "done" ? <Check className="size-3.5" /> : item.status === "blocked" ? <AlertCircle className="size-4" /> : <Circle className="size-4" />}
      </span>
      <span>{item.label}</span>
      <span className="text-xs text-muted-foreground">{labels[item.status]}</span>
    </li>)}
  </ul>;
}
