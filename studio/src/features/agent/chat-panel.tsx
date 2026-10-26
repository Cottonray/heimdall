import { useEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/ui/chat-markdown";
import { BottomPanel } from "@/components/ui/bottom-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Hand } from "@/components/ui/material-icons";
import type { Session } from "../../../../contracts/studio";

export function ChatPanel({session,busy,onCommand}: {session:Session;busy:boolean;onCommand:(tool:"qa_agent"|"qa_pause",goal?:string)=>Promise<unknown>}) {
  const [draft,setDraft]=useState("");
  const sending=useRef(false);
  const end=useRef<HTMLDivElement>(null);
  const messages=session.chat?.length ? session.chat : [{ role: "assistant" as const, text: "어떤 테스트를 만들까요? 확인할 동작과 기대 결과를 알려주세요.", at: 0 }];
  useEffect(()=>{end.current?.scrollIntoView({block:"nearest"});},[messages.length,session.ai]);
  useEffect(()=>setDraft(""),[session.id]);
  async function send(){
    const text=draft.trim();
    if(!text || busy || session.ai || sending.current)return;
    sending.current=true;
    setDraft("");
    try { await onCommand("qa_agent",text); } finally { sending.current=false; }
  }
  return <BottomPanel id={`session-chat-${session.id}`} storageKey={`heimdall:chat:${session.projectId}`} title="AI 채팅" toolbar={session.ai ? <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void onCommand("qa_pause")}><Hand />중지</Button> : undefined}>
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div role="log" aria-label="AI 대화" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message,index)=><div key={`${message.at}-${index}`} className={message.role==="user"?"flex justify-end":"flex justify-start"}>
          <div className={message.role==="user"?"max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground":"max-w-[85%] whitespace-pre-wrap break-words rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm"}>
            <p className={message.role==="user"?"mb-1 text-xs text-primary-foreground/80":"mb-1 text-xs text-primary"}>{message.role==="user"?"나":"AI"}</p>{message.role === "assistant" ? <ChatMarkdown>{message.text}</ChatMarkdown> : message.text}
          </div>
        </div>)}
        {session.ai && <p role="status" className="text-sm text-muted-foreground">화면을 확인하고 있어요…</p>}
        <div ref={end} />
      </div>
      <form className="flex shrink-0 items-end gap-2 border-t p-3" onSubmit={event=>{event.preventDefault();void send();}}>
        <Textarea aria-label="AI에게 메시지" placeholder="테스트 요청을 입력해 주세요" rows={2} maxLength={1500} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}} />
        <Button type="submit" disabled={busy||session.ai||!draft.trim()} aria-label="전송"><Send />전송</Button>
      </form>
    </div>
  </BottomPanel>;
}
