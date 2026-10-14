process.env.HEIMDALL_ALLOWED_HOSTS = "gateway.example,heimdall.example";
import test from 'node:test'
import assert from 'node:assert/strict'
import { allowed, validateAction, script } from './studio.ts'
import { parseUiSource } from './device.ts'

test('native UI parsing works for both Appium and adb trees', () => {
    for (const tag of ['node','android.widget.TextView']) {
        const n=parseUiSource(`<${tag} text="골목 &amp; QA" resource-id="com.aidemo:id/title" bounds="[0,10][500,50]" clickable="true"/>`)[0]
        assert.equal(n.text,'골목 & QA'); assert.equal(n.id,'title'); assert.equal(n.bounds.bottom,50)
    }
})

test('public demo host and foreign origins cannot operate Studio', () => {
    const req = (host: string, origin?: string, remoteAddress = '172.30.0.2') => ({ headers: { host, origin }, socket: { remoteAddress } }) as any
    assert.equal(allowed(req('qa.example')), false)
    assert.equal(allowed(req('gateway.example','https://attacker.example')),false)
    assert.equal(allowed(req('gateway.example','https://gateway.example')),true)
    assert.equal(allowed(req('127.0.0.1:8080',undefined,'127.0.0.1')),true)
})
test('reject executable actions, unbounded input and invalid coordinates', () => {
    assert.throws(()=>validateAction({type:'eval',value:'process.exit()'}))
    assert.throws(()=>validateAction({type:'point',x:NaN,y:10}))
    assert.throws(()=>validateAction({type:'fill',value:'x'}))
    assert.throws(()=>validateAction({type:'type',value:'x'.repeat(5000)}))
})
test('export escapes user text and retains failed operations and assertions for honest replay', () => {
    const text = "O'Reilly\n김테스트"
    const code=script({engine:'web',name:'검증',url:'http://127.0.0.1:8081/demo/',steps:[
        {ok:true,action:{type:'fill',selector:'#recipient',value:text}},
        {ok:false,action:{type:'click',text:'missing'}},
        {ok:true,action:{type:'assert',text:'입력 확인 완료'}},
        {ok:true,action:{type:'api',url:'http://127.0.0.1:8081/demo/api/accounts',status:200,contains:'accounts'}},
    ]})
    assert.ok(code.includes(JSON.stringify(text)))
    assert.ok(code.includes('missing'))
    assert.ok(code.includes('toBeVisible()'))
    assert.ok(code.includes('toContain("accounts")'))
})

test('AI assertion aliases keep the expected result rather than searching for undefined',()=>{const a=validateAction({type:'assert',selector:'status',contains:'김테스트님 · 10,000원 · 입력 확인 완료'});assert.equal(a.text,a.contains)})


test('persisted JSON objects and transitional string rows preserve saved history', async () => {
    const {readSessionBody} = await import('./studio/domain/serialization.ts')
    const body={id:'test-session',steps:[{n:1,ok:false,action:{type:'assert',text:'expected'}}]}
    assert.deepEqual(readSessionBody(body),body)
    assert.deepEqual(readSessionBody(JSON.stringify(body)),body)
    assert.throws(()=>readSessionBody({id:'bad'}))
})


test('AI verification retry is cleared after a real successful assertion', async()=>{
    const {agent}=await import('./studio/application/agent.ts')
    const s:import('./studio/domain/types.ts').Session={id:'test',name:'test',engine:'web',url:'http://test',state:'manual',message:'',created:'',updated:0,steps:[],working:false,ai:false,epoch:0,tail:Promise.resolve()}
    const prompts:string[]=[]
    await agent(s,'verify',{
        observe:async()=>({tree:'result'}),persist:async()=>{},
        complete:async(prompt)=>{prompts.push(prompt);return prompts.length===2?{action:{type:'assert',text:'result'}}:{done:true}},
        action:async(session,action,actor)=>{const step={n:1,at:'',actor,action,ok:true,ms:1};session.steps.push(step);return step}
    })
    for(let i=0;i<20&&s.ai;i++)await new Promise(resolve=>setImmediate(resolve))
    assert.equal(s.state,'passed');assert.equal(s.steps.length,1);assert.equal(prompts.length,3)
    assert.ok(prompts[1].includes('Your last done response'))
    assert.ok(!prompts[2].includes('Your last done response'))
})

test('Android exports Appium TypeScript and keeps input as escaped data', () => {
  const code = script({engine:'android',name:'test',url:'',steps:[{action:{type:'fill',selector:'input',value:'"; process.exit(); //'}},{action:{type:'assert',text:'done'}}]});
  assert.match(code, /from "webdriverio"/);
  assert.match(code, /deleteSession/);
  assert.ok(code.includes(JSON.stringify('"; process.exit(); //')));
  assert.match(code, /isExisting/);
});
test('API code does not navigate a browser', () => {
  assert.doesNotMatch(script({engine:'api',name:'API',url:'https://example.com',steps:[]}), /page.goto/);
});
