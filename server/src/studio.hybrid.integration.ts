// Live OpenRouter + human intervention + replay. Only uses the owned banking sample.
import assert from 'node:assert/strict'
const base='http://127.0.0.1:8080/aiqa/api/studio'
async function call(tool:string,args:any={}) {const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tool,arguments:args})});const d=await r.json() as any;if(!r.ok)throw Error(d.error);return d}
async function settle(id:string){for(let i=0;i<100;i++){const s=await call('qa_observe',{id});if(!s.ai)return s;await new Promise(r=>setTimeout(r,1000))}throw Error('AI timeout')}
const s=await call('qa_open',{engine:'web',name:'AI + 사람 · 하이브리드 검증 완료'})
try {
    await call('qa_agent',{id:s.id,goal:'이체 화면을 열어 줘'})
    await call('qa_pause',{id:s.id})
    const paused=await settle(s.id)
    assert.equal(paused.steps.length,0,'AI executed after the human pause')
    console.log('PASS pending AI action is canceled when human takes control')
    await call('qa_action',{id:s.id,action:{type:'click',selector:'#transfer'}})
    await call('qa_action',{id:s.id,action:{type:'fill',selector:'#recipient',value:'김테스트'}})
    await call('qa_agent',{id:s.id,goal:'받는 사람 김테스트는 사람이 이미 입력했어. 그 입력은 유지하고 금액 10000을 넣은 뒤 입력 확인 버튼을 눌러. 김테스트님 · 10,000원 · 입력 확인 완료가 화면에 표시되는지 검증해 줘.'})
    const result=await settle(s.id)
    assert.equal(result.state,'passed',result.message)
    assert.ok(result.steps.some((x:any)=>x.actor==='AI'&&x.action.type==='assert'&&x.ok))
    assert.equal(result.steps.filter((x:any)=>x.action.selector==='#recipient'&&x.action.type==='fill').length,1)
    assert.ok(result.steps.every((x:any)=>x.ok))
    console.log('PASS AI retains human input and executes a concrete assertion')
    const replay=await call('qa_replay',{id:s.id})
    try{assert.equal((await settle(replay.id)).state,'passed');console.log('PASS mixed human/AI scenario replays successfully')}finally{await call('qa_close',{id:replay.id})}
    console.log(JSON.stringify({at:new Date().toISOString(),id:s.id,state:result.state,steps:result.steps.map((x:any)=>({n:x.n,actor:x.actor,action:x.action,ok:x.ok})),replay:replay.id},null,2))
} catch(e){await call('qa_close',{id:s.id}).catch(()=>{});throw e}
