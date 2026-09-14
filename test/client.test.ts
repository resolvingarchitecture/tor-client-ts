import assert from "node:assert/strict";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { test } from "node:test";

import { Envelope } from "@resolvingarchitecture/ra-common";

import { Status, TorClient } from "../src/index.js";

function listenOn(server: import("node:net").Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/**
 * Buffers a server-side connection's bytes behind one long-lived `"data"`
 * listener and serves sequential `readExact` calls against that buffer -
 * mirrors `SocketReader` in `src/socks.ts`. A naive per-call
 * attach/detach/reattach `"data"` listener (with `socket.unshift` for
 * leftover bytes) looks reasonable but is unreliable across more than two
 * reads on the same socket; see that file's comment for the failure this
 * avoids.
 */
class TestSocketReader {
  private buf = Buffer.alloc(0);
  private pending: { n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null = null;

  constructor(socket: Socket) {
    socket.on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this.tryResolve();
    });
    socket.once("close", () => {
      if (this.pending !== null) {
        const { reject } = this.pending;
        this.pending = null;
        reject(new Error("closed before enough bytes"));
      }
    });
  }

  readExact(n: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.pending = { n, resolve, reject };
      this.tryResolve();
    });
  }

  private tryResolve(): void {
    if (this.pending !== null && this.buf.length >= this.pending.n) {
      const { n, resolve } = this.pending;
      this.pending = null;
      const result = this.buf.subarray(0, n);
      this.buf = this.buf.subarray(n);
      resolve(result);
    }
  }
}

test("start fails cleanly without a daemon", async () => {
  const client = TorClient.fromConfig({ "ra.tor.socksPort": "1", "ra.tor.controlPort": "1" });
  assert.equal(await client.start(), false);
  assert.equal(client.status(), Status.Disconnected);
});

test("send without start reports not started", async () => {
  const client = TorClient.fromConfig({ "ra.tor.socksPort": "1", "ra.tor.controlPort": "1" });
  const env = new Envelope();
  env.headers["url"] = "http://example.onion/";
  assert.equal(await client.send(env), false);
  assert.equal(env.headers["error"], "Tor client not started");
});

test("send without url header errors", async () => {
  const client = new TorClient();
  const env = new Envelope();
  assert.equal(await client.send(env), false);
  assert.equal(env.headers["error"], "no url header");
});

test("socks connect and http fetch through a fake proxy", async () => {
  // A fake SOCKS5 proxy that also serves the "destination" HTTP response,
  // mirroring tor-client-rust's / tor-client-python's integration test of
  // the same shape.
  const controlSrv = createServer((socket) => socket.destroy());
  const controlPort = await listenOn(controlSrv);

  let handled = false;
  const socksSrv = createServer((socket) => {
    if (handled) {
      socket.destroy();
      return;
    }
    void (async () => {
      try {
        // The detector probes the SOCKS port before the real request, so a
        // connection that closes before sending the 3-byte greeting is that
        // probe - reader.readExact rejects and we just let it go.
        const reader = new TestSocketReader(socket);
        await reader.readExact(3);
        socket.write(Buffer.from([0x05, 0x00]));
        const head = await reader.readExact(5);
        const nameLen = head[4]!;
        await reader.readExact(nameLen + 2);
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        handled = true;
        socket.once("data", () => {
          socket.end("HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello");
        });
      } catch {
        // probe connection closed early
      }
    })();
  });
  const socksPort = await listenOn(socksSrv);

  try {
    const client = TorClient.fromConfig({
      "ra.tor.socksPort": String(socksPort),
      "ra.tor.controlPort": String(controlPort),
    });
    assert.equal(await client.start(), true);
    assert.equal(client.status(), Status.Connected);

    const env = new Envelope();
    env.headers["url"] = "http://example.onion/path";
    assert.equal(await client.send(env), true);
    assert.deepEqual(env.headers["body"], Buffer.from("hello"));
  } finally {
    socksSrv.close();
    controlSrv.close();
  }
});
