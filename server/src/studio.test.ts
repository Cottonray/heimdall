import test from 'node:test'
import assert from 'node:assert/strict'
import { allowed, validateAction, script } from './studio.ts'

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
test('export escapes user text and omits failed operations while retaining assertions', () => {
    const text = "O'Reilly\n김테스트"
    const code=script({engine:'web',name:'검증',url:'http://127.0.0.1:8081/demo/',steps:[
        {ok:true,action:{type:'fill',selector:'#recipient',value:text}},
        {ok:false,action:{type:'click',text:'missing'}},
        {ok:true,action:{type:'assert',text:'입력 확인 완료'}},
        {ok:true,action:{type:'api',url:'http://127.0.0.1:8081/demo/api/accounts',status:200,contains:'accounts'}},
    ]})
    assert.ok(code.includes(JSON.stringify(text)))
    assert.ok(!code.includes('missing'))
    assert.ok(code.includes('toBeVisible()'))
    assert.ok(code.includes('toContain("accounts")'))
})
