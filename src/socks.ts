/**
 * Minimal SOCKS5 CONNECT client (no auth) - enough to tunnel an HTTP request
 * through Tor's SOCKS proxy. Ports `tor-client-rust`'s `socks` module.
 */
import { connect as netConnect, Socket } from "node:net";

export async function connectThrough(
  proxyHost: string,
  proxyPort: number,
  destHost: string,
  destPort: number,
  timeoutMs: number,
): Promise<Socket> {
  const socket = await tcpConnect(proxyHost, proxyPort, timeoutMs);
  const reader = new SocketReader(socket);
  const readTimeoutMs = Math.max(timeoutMs, 30_000);

  try {
    // greeting: VER=5, NMETHODS=1, METHOD=0 (no auth)
    socket.write(Buffer.from([0x05, 0x01, 0x00]));
    const method = await reader.readExact(2, readTimeoutMs);
    if (method[0] !== 0x05 || method[1] !== 0x00) {
      throw new Error(`SOCKS5 proxy refused no-auth (got [${method[0]},${method[1]}])`);
    }

    // request: VER=5, CMD=1 (connect), RSV=0, ATYP=3 (domain), len, name, port
    const hostBuf = Buffer.from(destHost, "ascii");
    if (hostBuf.length > 255) {
      throw new Error("host too long");
    }
    const req = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
      hostBuf,
      portBuf(destPort),
    ]);
    socket.write(req);

    // reply: VER, REP, RSV, ATYP, BND.ADDR, BND.PORT
    const head = await reader.readExact(4, readTimeoutMs);
    if (head[1] !== 0x00) {
      throw new Error(`SOCKS5 connect failed, REP=${head[1]}`);
    }
    let bndLen: number;
    switch (head[3]) {
      case 0x01:
        bndLen = 4;
        break;
      case 0x04:
        bndLen = 16;
        break;
      case 0x03:
        bndLen = (await reader.readExact(1, readTimeoutMs))[0]!;
        break;
      default:
        throw new Error(`SOCKS5 bad ATYP ${head[3]}`);
    }
    await reader.readExact(bndLen + 2, readTimeoutMs);
    reader.release();
    return socket;
  } catch (e) {
    reader.release();
    socket.destroy();
    throw e;
  }
}

function portBuf(port: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(port, 0);
  return b;
}

function tcpConnect(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`connect timeout to ${host}:${port}`));
    });
    socket.once("error", (e) => reject(e));
  });
}

/**
 * Buffers a socket's incoming bytes behind a single long-lived `"data"`
 * listener and serves `readExact` calls against that buffer.
 *
 * Node has no blocking "read exactly N bytes" call, so the naive approach -
 * attach a `"data"` listener per read, remove it once satisfied, re-attach
 * for the next read - looks reasonable but is unreliable in practice: a
 * fresh listener added after the previous one was removed does not
 * reliably resume flowing in time to catch data that already arrived
 * between the socket's writes (confirmed experimentally - the socket's
 * *second* `readExact` call on a freshly reconnected listener silently
 * never fires, even though the underlying bytes are already on the wire).
 * Keeping one persistent listener for the reader's whole lifetime avoids
 * the pause/resume transition entirely. Only one `readExact` may be
 * in flight at a time, which matches this client's fully sequential
 * request/response usage.
 */
class SocketReader {
  private buf: Buffer = Buffer.alloc(0);
  private pending: { n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;
  private readonly onData = (chunk: Buffer): void => {
    this.buf = Buffer.concat([this.buf, chunk]);
    this.tryResolvePending();
  };
  private readonly onError = (e: Error): void => this.fail(e);
  private readonly onClose = (): void => this.fail(new Error("connection closed early"));

  constructor(private readonly socket: Socket) {
    socket.on("data", this.onData);
    socket.once("error", this.onError);
    socket.once("close", this.onClose);
  }

  readExact(n: number, timeoutMs: number): Promise<Buffer> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error("read timeout"));
      }, timeoutMs);
      this.pending = {
        n,
        resolve: (b) => {
          clearTimeout(timer);
          resolve(b);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.tryResolvePending();
    });
  }

  /** Detach listeners once the reader is no longer needed (handshake done, or
   * failed) so the caller can attach its own `"data"` listener for the rest
   * of the connection without a second consumer silently draining bytes. */
  release(): void {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
  }

  private tryResolvePending(): void {
    if (this.pending !== null && this.buf.length >= this.pending.n) {
      const { n, resolve } = this.pending;
      this.pending = null;
      const result = this.buf.subarray(0, n);
      this.buf = this.buf.subarray(n);
      resolve(result);
    }
  }

  private fail(e: Error): void {
    this.failure = e;
    if (this.pending !== null) {
      const { reject } = this.pending;
      this.pending = null;
      reject(e);
    }
  }
}
