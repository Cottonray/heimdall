import { useId, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "./material-icons";
import { Button } from "./button";
import type { ChatCheck } from "../../../../contracts/studio";

const labels = { pending: "대기", running: "진행 중", done: "완료", blocked: "중단", skipped: "소스 없음" };
function CheckItem({ item }: { item: ChatCheck }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <li className="col-span-4 grid grid-cols-subgrid">
    <div className="col-span-4 grid min-h-8 grid-cols-subgrid items-center">
      <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${item.status === "done" ? "border-success bg-success text-white" : item.status === "running" ? "animate-spin border-primary/25 border-t-primary motion-reduce:animate-none" : "border-muted-foreground/50 text-muted-foreground"}`}>
        {item.status === "done" ? <Check className="size-3.5" /> : item.status === "blocked" ? <span className="text-xs leading-none">!</span> : null}
      </span>
      <span className="min-w-0 whitespace-normal leading-5">{item.label}</span>
      <span className="whitespace-nowrap text-center text-xs text-muted-foreground">{labels[item.status]}</span>
      <div className="flex justify-end">{!!item.details?.length && <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={id} aria-label={`시나리오 작성 상세 ${open ? "접기" : "펼치기"}`} onClick={() => setOpen(!open)}>{open ? <ChevronUp /> : <ChevronDown />}{item.details.length}개</Button>}</div>
    </div>
    {!!item.details?.length && <ol id={id} hidden={!open} className="col-start-2 col-span-3 my-2 list-decimal space-y-1 whitespace-normal pl-4 text-xs text-muted-foreground">{item.details.map((text, index) => <li key={index}>{text}</li>)}</ol>}
  </li>;
}
export function ChatChecklist({ items }: { items: ChatCheck[] }) {
  return <ul aria-label="시나리오 검증 목록" className="mt-3 grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem_4rem] gap-x-2 gap-y-1">{items.map((item, index) => <CheckItem key={index} item={item} />)}</ul>;
}
