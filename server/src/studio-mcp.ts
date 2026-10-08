// MCP stdio bridge. Run through SSH: credentials stay in the existing SSH profile.
import readline from 'node:readline'
const input = readline.createInterface({ input: process.stdin })
for await (const line of input) {
    if (!line.trim()) continue
    let request: any
    try {
        request = JSON.parse(line)
        const res = await fetch('http://127.0.0.1:8080/aiqa/api/studio/mcp', { method:'POST', headers:{'content-type':'application/json'},body:line, signal:AbortSignal.timeout(240000) })
        if (res.status === 202) continue
        const response = await res.text()
        if (!res.ok) throw new Error(response)
        process.stdout.write(response + '\n')
    } catch(e) {
        if (request?.id !== undefined) process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:String(e)}})+'\n')
    }
}
