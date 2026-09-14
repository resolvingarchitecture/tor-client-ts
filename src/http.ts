/**
 * A tiny HTTP/1.1 GET. HTTP only (no TLS) - HTTPS needs a TLS layer wrapped
 * around the SOCKS socket, see `TODO.md`. Ports `tor-client-rust`'s `http`
 * module.
 */
import type { Socket } from "node:net";

import { connectThrough } from "./socks.js";

const USER_AGENT = "ra-tor-client";

export interface ParsedUrl {
  host: string;
  port: number;
  path: string;
}

/** Fetch `url` (`http://` only) through the SOCKS5 proxy; returns the response body. */
export async function fetchViaSocks(
  proxyHost: string,
  proxyPort: number,
  url: string,
  timeoutMs: number,
): Promise<Buffer> {
  const { host, port, path } = parseUrl(url);
  const socket = await connectThrough(proxyHost, proxyPort, host, port, timeoutMs);
  return readResponseBody(socket, host, path);
}

function readResponseBody(socket: Socket, host: string, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.on("data", (c: Buffer) => chunks.push(c));
    socket.once("end", () => resolve(splitBody(Buffer.concat(chunks))));
    socket.once("error", reject);
    socket.write(formatGet(host, path));
  });
}

/** Split `host`, `port` and `path` out of an `http://` URL. Throws on any other scheme. */
export function parseUrl(url: string): ParsedUrl {
  if (!url.startsWith("http://")) {
    throw new Error("only http:// URLs are supported (HTTPS needs a TLS layer - see TODO.md)");
  }
  const rest = url.slice("http://".length);
  const slash = rest.indexOf("/");
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "/" : rest.slice(slash);

  const colon = authority.lastIndexOf(":");
  if (colon === -1) {
    return { host: authority, port: 80, path };
  }
  const host = authority.slice(0, colon);
  const portStr = authority.slice(colon + 1);
  const port = Number(portStr);
  if (!Number.isInteger(port) || portStr.length === 0) {
    throw new Error("bad port");
  }
  return { host, port, path };
}

/** The GET request line + headers for `path` on `host`, `Connection: close`. */
export function formatGet(host: string, path: string): string {
  return (
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${host}\r\n` +
    `User-Agent: ${USER_AGENT}\r\n` +
    `Accept: */*\r\n` +
    `Connection: close\r\n\r\n`
  );
}

/** Everything after the first CRLFCRLF (the body), or the whole buffer if no
 * header/body separator is present. */
export function splitBody(raw: Buffer): Buffer {
  const sep = raw.indexOf("\r\n\r\n");
  return sep === -1 ? raw : raw.subarray(sep + 4);
}
