import assert from "node:assert/strict";
import { test } from "node:test";

import { formatGet, parseUrl, splitBody } from "../src/index.js";

test("parseUrl with path and port", () => {
  assert.deepEqual(parseUrl("http://example.onion:81/path"), {
    host: "example.onion",
    port: 81,
    path: "/path",
  });
});

test("parseUrl with no path defaults to root", () => {
  assert.deepEqual(parseUrl("http://example.onion"), {
    host: "example.onion",
    port: 80,
    path: "/",
  });
});

test("parseUrl rejects https", () => {
  assert.throws(() => parseUrl("https://example.onion/"));
});

test("formatGet has Connection: close", () => {
  const req = formatGet("example.onion", "/path");
  assert.ok(req.startsWith("GET /path HTTP/1.1\r\n"));
  assert.ok(req.includes("Host: example.onion\r\n"));
  assert.ok(req.endsWith("Connection: close\r\n\r\n"));
});

test("splitBody after headers", () => {
  const raw = Buffer.from("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello");
  assert.deepEqual(splitBody(raw), Buffer.from("hello"));
});

test("splitBody with no separator returns whole buffer", () => {
  const raw = Buffer.from("not really http");
  assert.deepEqual(splitBody(raw), raw);
});
