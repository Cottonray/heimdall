// Run inside the deployed aiqa container. Uses only the owned sample banking app.
import assert from 'node:assert/strict'
const base='http://127.0.0.1:8080/aiqa/api/studio'
const owned=new Set<string>()
async function call(tool:string,args:any={}) {const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tool,arguments:args})});const d=await r.json() as any;if(!r.ok)throw Error(d.error);return d}
async function open(engine:string,name:string){const s=await call('qa_open',{engine,name});owned.add(s.id);return s}
async function close(id:string){await call('qa_close',{id});owned.delete(id)}
const report:any={at:new Date().toISOString(),checks:[]}
const ok=(name:string)=>{report.checks.push(name);console.log('PASS',name)}
try {
    const denied=await fetch(base,{method:'POST',headers:{'content-type':'application/json',origin:'https://untrusted.example'},body:'{}'})
    assert.equal(denied.status,403);ok('foreign origin rejected')
    await assert.rejects(()=>call('qa_open',{engine:'web',url:'http://169.254.169.254/latest/meta-data/'}));ok('unregistered destination rejected')
    const [a,b]=await Promise.all([open('web','검증 · 병렬 A'),open('mobile-web','검증 · 병렬 B')])
    await assert.rejects(()=>open('web','overflow'));ok('two browser slots; third rejected')
    const ws=new WebSocket('ws://127.0.0.1:8080/aiqa/studio/ws');let event=false
    await new Promise<void>((resolve,reject)=>{ws.onopen=()=>resolve();ws.onerror=()=>reject(Error('websocket failed'))})
    ws.onmessage=e=>{if(JSON.parse(String(e.data)).type==='studio')event=true}
    await Promise.all([a,b].map((s,i)=>call('qa_action',{id:s.id,action:{type:'click',selector:'#transfer'}}).then(()=>call('qa_action',{id:s.id,action:{type:'fill',selector:'#recipient',value:`테스트${i}`}}))))
    const av=await call('qa_observe',{id:a.id}),bv=await call('qa_observe',{id:b.id})
    assert.ok(av.observation.tree.includes('테스트0'));assert.ok(bv.observation.tree.includes('테스트1'));assert.ok(!av.observation.tree.includes('테스트1'));ok('parallel sessions keep inputs isolated')
    assert.ok(event);ws.close();ok('WebSocket action events received')
    await call('qa_action',{id:a.id,action:{type:'fill',selector:'#amount',value:'10000'}})
    await call('qa_action',{id:a.id,action:{type:'click',selector:'#review'}})
    assert.equal((await call('qa_action',{id:a.id,action:{type:'assert',text:'입력 확인 완료'}})).ok,true)
    assert.equal((await call('qa_action',{id:a.id,action:{type:'api',url:'http://127.0.0.1:8081/demo/api/accounts',status:200,contains:'QA 테스트 계좌'}})).ok,true);ok('web and API expectations verified')
    const failed=await call('qa_action',{id:b.id,action:{type:'assert',text:'의도적인 실패 문구'}})
    assert.equal(failed.ok,false);assert.ok(failed.evidence)
    const shot=await fetch(`${base}/evidence?id=${b.id}&file=${failed.evidence}`);assert.equal(shot.status,200);assert.ok((await shot.arrayBuffer()).byteLength>1000);ok('failure captures a readable screenshot and error')
    const exported=await call('qa_export',{id:a.id});assert.ok(exported.code.includes('toBeVisible'));assert.ok(exported.jsonl.includes('Human'));ok('replay JSONL and executable Playwright source exported')
    report.scenario=a.id;report.failure=b.id
    await close(a.id);await close(b.id)
    const replay=await call('qa_replay',{id:a.id});owned.add(replay.id)
    for(let i=0;i<60;i++){const s=await call('qa_observe',{id:replay.id});if(!s.ai){assert.equal(s.state,'passed',s.message);break}await new Promise(r=>setTimeout(r,500));if(i===59)throw Error('replay timeout')}
    report.replay=replay.id;await close(replay.id);ok('saved scenario replay passes')
    const mobile=await open('android','검증 · Appium Android')
    const node=mobile.observation.tree.find((n:any)=>n.text && /[가-힣]/.test(n.text))
    assert.ok(node,'no native UI text');assert.equal((await call('qa_action',{id:mobile.id,action:{type:'assert',text:node.text}})).ok,true)
    assert.ok((await fetch(`${base}/frame?id=${mobile.id}`)).ok)
    await assert.rejects(()=>open('android','occupied'));await close(mobile.id);ok('Appium native assertion, frame and exclusive reservation')
    const rpc=await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}).then(r=>r.json()) as any
    assert.ok(rpc.result.tools.some((x:any)=>x.name==='qa_pause'));assert.equal(rpc.result.tools.length,10);ok('MCP tool inventory available')
    console.log(JSON.stringify(report,null,2))
} finally {for(const id of owned)await call('qa_close',{id}).catch(()=>{})}
