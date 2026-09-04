// WebSocket(RFC 6455) 서버 — **의존성 없이** 직접 짠다.
//
// AICC 는 SSE 로 끝냈지만(서버→화면 한 방향) 여기는 다르다. 화면 프레임이 **바이너리**로
// 계속 내려가고, 손가락질(탭·스와이프·글자)이 **같은 연결로 올라온다.** SSE + POST 로
// 나누면 왕복이 하나 더 붙고, 조작 지연은 이 데모에서 바로 티가 난다.
//
// 그렇다고 `ws` 를 들이면 이 스택의 전제(node_modules 0)가 깨진다. 우리가 쓰는 범위는
// 좁다 — 서버는 마스킹하지 않고, 보내는 프레임은 한 조각이며, 받는 것은 작은 JSON 뿐이다.
// 그래서 필요한 것만 담았다:
//   · 핸드셰이크(Sec-WebSocket-Accept)
//   · 텍스트/바이너리 프레임 보내기 (길이 7/16/64비트)
//   · 마스킹된 클라이언트 프레임 읽기 + 조각난 프레임 잇기
//   · ping/pong, close
//
// 담지 않은 것: 확장(permessage-deflate)·서브프로토콜 협상. 협상하지 않으므로 상대가
// 요구해도 그냥 안 쓴다(그게 규격의 기본값이다).

import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/**
 * RFC 6455 가 못박아 둔 상수. 이 문자열을 키에 붙여 해시한 것이 Accept 헤더다.
 *
 * **자리 나눔에 주의.** `…-95CA-C5AB0DC85B11` 이다. 이걸 `…-95CA-5AB0DC85B11A` 로
 * 옮겨 적으면(외워서 쓰면 흔히 이렇게 된다) 핸드셰이크가 통째로 실패하는데, 브라우저가
 * 내는 말은 "Incorrect hash received in Sec-WebSocket-Accept header" 한 줄뿐이라
 * 프레임 코드부터 뒤지게 된다 — 실제로 여기서 그렇게 한 번 헤맸다.
 */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/**
 * 한 프레임의 상한. 올라오는 것은 작은 JSON 뿐이라 넉넉히 잡아도 이 정도면 충분하고,
 * 넘어오면 그건 우리 화면이 보낸 것이 아니다 — 연결을 끊는다.
 */
const MAX_INBOUND = 1 << 20

type Opcode = 0x0 | 0x1 | 0x2 | 0x8 | 0x9 | 0xa

export type WsHandlers = {
    onMessage?: (data: string) => void
    onClose?: () => void
}

/**
 * 열려 있는 연결 하나. 밖에서는 `send`/`sendBinary`/`close` 만 쓴다.
 */
export class WsConnection {
    readonly socket: Duplex
    /** 화면이 붙은 시각. 오래 매달린 연결을 걷어낼 때 쓴다 */
    readonly since = Date.now()
    private closed = false
    private handlers: WsHandlers = {}

    /** 이어 붙이는 중인 조각들 (opcode 0 continuation) */
    private fragOpcode: Opcode | null = null
    private fragments: Buffer[] = []
    private buffer: Buffer = Buffer.alloc(0)

    constructor(socket: Duplex) {
        this.socket = socket
        socket.on('data', (chunk: Buffer) => this.feed(chunk))
        socket.on('error', () => this.destroy())
        socket.on('close', () => this.destroy())
    }

    on(handlers: WsHandlers) {
        this.handlers = { ...this.handlers, ...handlers }
    }

    get isOpen() {
        return !this.closed && this.socket.writable
    }

    /**
     * 백프레셔. 화면 프레임은 **밀린 만큼 버리는 편이 맞다** — 늦게 도착한 옛 화면은
     * 아무 쓸모가 없고, 쌓아 두면 메모리만 먹다가 회선이 풀린 순간 옛 화면이 우수수
     * 지나간다. 프레임 루프가 이 값을 보고 그 판을 건너뛴다.
     */
    get backlog() {
        return this.socket.writableLength
    }

    send(text: string) {
        this.frame(0x1, Buffer.from(text, 'utf8'))
    }

    sendBinary(data: Buffer) {
        this.frame(0x2, data)
    }

    ping() {
        this.frame(0x9, Buffer.alloc(0))
    }

    close(code = 1000) {
        if (this.closed) return
        const payload = Buffer.alloc(2)
        payload.writeUInt16BE(code)
        this.frame(0x8, payload)
        this.destroy()
    }

    private destroy() {
        if (this.closed) return
        this.closed = true
        this.socket.destroy()
        this.handlers.onClose?.()
    }

    // ── 내보내기 ─────────────────────────────────────────────────────────────

    private frame(opcode: Opcode, payload: Buffer) {
        if (!this.isOpen) return
        const len = payload.length
        // 서버가 보내는 프레임은 마스킹하지 않는다(규격상 금지에 가깝다 — 클라이언트만 한다).
        let header: Buffer
        if (len < 126) {
            header = Buffer.alloc(2)
            header[1] = len
        } else if (len < 65536) {
            header = Buffer.alloc(4)
            header[1] = 126
            header.writeUInt16BE(len, 2)
        } else {
            header = Buffer.alloc(10)
            header[1] = 127
            // 상위 32비트는 0 — 4GB 짜리 프레임을 보낼 일이 없다
            header.writeUInt32BE(0, 2)
            header.writeUInt32BE(len, 6)
        }
        header[0] = 0x80 | opcode // FIN + opcode
        this.socket.write(Buffer.concat([header, payload]))
    }

    // ── 받아들이기 ───────────────────────────────────────────────────────────

    private feed(chunk: Buffer) {
        this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
        // 한 번에 여러 프레임이 붙어 올 수 있다. 더 못 읽을 때까지 돌린다
        for (;;) {
            const consumed = this.readFrame()
            if (!consumed) return
        }
    }

    /** 프레임 하나를 읽어 처리했으면 true. 아직 덜 왔으면 false */
    private readFrame(): boolean {
        const buf = this.buffer
        if (buf.length < 2) return false

        const fin = (buf[0] & 0x80) !== 0
        const opcode = (buf[0] & 0x0f) as Opcode
        const masked = (buf[1] & 0x80) !== 0
        let len = buf[1] & 0x7f
        let offset = 2

        if (len === 126) {
            if (buf.length < offset + 2) return false
            len = buf.readUInt16BE(offset)
            offset += 2
        } else if (len === 127) {
            if (buf.length < offset + 8) return false
            // 상위 32비트가 0 이 아니면 우리가 감당할 크기가 아니다
            if (buf.readUInt32BE(offset) !== 0) {
                this.close(1009)
                return false
            }
            len = buf.readUInt32BE(offset + 4)
            offset += 8
        }

        if (len > MAX_INBOUND) {
            this.close(1009)
            return false
        }

        // **클라이언트 프레임은 반드시 마스킹돼 있다.** 아니면 규격 위반이라 끊는다.
        if (!masked) {
            this.close(1002)
            return false
        }
        if (buf.length < offset + 4) return false
        const mask = buf.subarray(offset, offset + 4)
        offset += 4

        if (buf.length < offset + len) return false
        const payload = Buffer.allocUnsafe(len)
        for (let i = 0; i < len; i += 1) payload[i] = buf[offset + i] ^ mask[i & 3]
        this.buffer = buf.subarray(offset + len)

        this.dispatch(fin, opcode, payload)
        return true
    }

    private dispatch(fin: boolean, opcode: Opcode, payload: Buffer) {
        if (opcode === 0x8) {
            this.destroy()
            return
        }
        if (opcode === 0x9) {
            this.frame(0xa, payload) // pong 은 받은 몸통을 그대로 돌려준다
            return
        }
        if (opcode === 0xa) return // 우리 ping 에 대한 답. 살아 있다는 뜻뿐이다

        if (opcode === 0x0) {
            // 이어지는 조각
            if (this.fragOpcode === null) {
                this.close(1002)
                return
            }
            this.fragments.push(payload)
        } else {
            this.fragOpcode = opcode
            this.fragments = [payload]
        }

        if (!fin) return

        const whole = this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments)
        const kind = this.fragOpcode
        this.fragOpcode = null
        this.fragments = []

        // 화면이 올려 보내는 것은 JSON 텍스트뿐이다. 바이너리는 받을 일이 없어 흘린다
        if (kind === 0x1) this.handlers.onMessage?.(whole.toString('utf8'))
    }
}

/**
 * `server.on('upgrade')` 에서 부른다. 핸드셰이크를 마치고 연결을 돌려준다.
 * 키가 없거나 형식이 틀리면 400 을 내고 `null` 이다.
 */
export function accept(req: IncomingMessage, socket: Duplex): WsConnection | null {
    const key = req.headers['sec-websocket-key']
    if (typeof key !== 'string' || key.length === 0) {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return null
    }
    const accept = createHash('sha1')
        .update(key + GUID)
        .digest('base64')

    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    // 프레임이 잘게 쪼개져 나가면 조작 지연이 그만큼 늘어난다. 업그레이드로 넘어오는 것은
    // 늘 TCP 소켓이지만 타입은 Duplex 라, 있을 때만 부른다
    if ('setNoDelay' in socket) (socket as unknown as { setNoDelay(v: boolean): void }).setNoDelay(true)
    return new WsConnection(socket)
}
