import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { test } from "node:test";

import { LocalTorDetector } from "../src/index.js";

function listeningServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.destroy());
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("expected an AddressInfo");
      }
      resolve({ server, port: address.port });
    });
  });
}

test("unreachable port is not reachable", async () => {
  const d = new LocalTorDetector({ socksPort: 1, controlPort: 1, timeoutMs: 200 });
  assert.equal(await d.isSocksReachable(), false);
  assert.equal(await d.isLocalTorRunning(), false);
});

test("reachable port is reachable", async () => {
  const { server, port } = await listeningServer();
  try {
    const d = new LocalTorDetector({ socksPort: port, timeoutMs: 500 });
    assert.equal(await d.isSocksReachable(), true);
  } finally {
    server.close();
  }
});

test("isLocalTorRunning requires both ports", async () => {
  const { server, port } = await listeningServer();
  try {
    const d = new LocalTorDetector({ socksPort: port, controlPort: 1, timeoutMs: 200 });
    assert.equal(await d.isSocksReachable(), true);
    assert.equal(await d.isControlReachable(), false);
    assert.equal(await d.isLocalTorRunning(), false);
  } finally {
    server.close();
  }
});
