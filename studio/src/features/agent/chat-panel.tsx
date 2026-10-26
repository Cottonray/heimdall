import { ChatChecklist } from "@/components/ui/chat-checklist";
import { useEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/ui/chat-markdown";
import { BottomPanel } from "@/components/ui/bottom-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Hand, ChevronDown } from "@/components/ui/material-icons";
import type { Session } from "../../../../contracts/studio";

export function ChatPanel({session,busy,onCommand}: {session:Session;busy:boolean;onCommand:(tool:"qa_agent"|"qa_pause"|"qa_replay",goal?:string)=>Promise<unknown>}) {
  const [draft,setDraft]=useState("");
  const sending=useRef(false);
  const end=useRef<HTMLDivElement>(null);
  const log=useRef<HTMLDivElement>(null);
  const content=useRef<HTMLDivElement>(null);
  const pinned=useRef(true);
  const [below,setBelow]=useState(false);
  const [height,setHeight]=useState(220);
  const scrollLatest=()=>{ const el=log.current; if(el){el.scrollTo({top:el.scrollHeight,behavior:"smooth"});pinned.current=true;} };
  useEffect(()=>{
    const el=content.current;
    if(!el)return;
    const observer=new ResizeObserver(()=>{
      setHeight(Math.max(220,el.scrollHeight+140));
      const viewport=log.current;
      if(viewport && pinned.current) viewport.scrollTop=viewport.scrollHeight;
      if(viewport)setBelow(viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight>24);
    });
    observer.observe(el);
    return ()=>observer.disconnect();
  },[session.id]);
  const messages: NonNullable<Session["chat"]> =session.chat?.length ? session.chat : [{ role: "assistant" as const, text: "어떤 테스트를 만들까요? 확인할 동작과 기대 결과를 알려주세요.", at: 0 }];
  useEffect(()=>{if(pinned.current)end.current?.scrollIntoView({block:"nearest"});},[messages.length,session.ai]);
  useEffect(()=>{setDraft("");pinned.current=true;setBelow(false);},[session.id]);
  async function send(){
    const text=draft.trim();
    if(!text || busy || session.ai || sending.current)return;
    sending.current=true;
    setDraft("");
    try { await onCommand("qa_agent",text); } finally { sending.current=false; }
  }
  return <BottomPanel id={`session-chat-${session.id}`} storageKey={`heimdall:chat:${session.projectId}`} title="AI 채팅" autoHeight={height} toolbar={session.ai ? <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void onCommand("qa_pause")}><Hand />중지</Button> : undefined}>
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div ref={log} onScroll={()=>{const el=log.current!;const away=el.scrollHeight-el.scrollTop-el.clientHeight>24;pinned.current=!away;setBelow(away);}} role="log" aria-label="AI 대화" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto p-4">
        <div ref={content} className="space-y-3">
        {messages.map((message,index)=><div key={`${message.at}-${index}`} className={message.role==="user"?"flex justify-end":"flex justify-start"}>
          <div className={message.role==="user"?"max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground":"max-w-[85%] whitespace-pre-wrap break-words rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm"}>
            <p className={message.role==="user"?"mb-1 text-xs text-primary-foreground/80":"mb-1 text-xs text-primary"}>{message.role==="user"?"나":"AI"}</p>{message.role === "assistant" ? <ChatMarkdown>{message.text}</ChatMarkdown> : message.text}
            {message.checklist && <ChatChecklist items={message.checklist} />}
          </div>
        </div>)}
        {session.ai && <p role="status" className="text-sm text-muted-foreground">{session.message || "화면을 확인하고 있어요…"}</p>}
        {!session.ai && session.verificationPending && <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">작성한 시나리오를 처음부터 실행해 검증할까요?</p>
          <Button size="sm" disabled={busy || session.working} onClick={()=>void onCommand("qa_replay")}>실행</Button>
        </div>}
        <div ref={end} />
        </div>
      </div>
      {below && <div className="flex shrink-0 justify-center pb-2"><Button size="sm" variant="secondary" onClick={scrollLatest}><ChevronDown />최신 메시지</Button></div>}
      <form className="flex shrink-0 items-end gap-2 border-t p-3" onSubmit={event=>{event.preventDefault();void send();}}>
        <Textarea aria-label="AI에게 메시지" placeholder="테스트 요청을 입력해 주세요" rows={2} maxLength={1500} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}} />
        <Button type="submit" disabled={busy||session.ai||!draft.trim()} aria-label="전송"><Send />전송</Button>
      </form>
    </div>
  </BottomPanel>;
}
