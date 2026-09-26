# tor-client (TypeScript) — Design

A local-only Tor client: attaches to a Tor daemon already running on the
host via its SOCKS proxy, for use as the Tor **protocol service** by a
future `1m5-core-ts`. A TypeScript port of the design in
[`tor-client-java`](https://github.com/resolvingarchitecture/tor-client-java),
trimmed to the same scope `tor-client-rust`'s *local* backend covers — same
scope cut `tor-client-python` already made.

## Where it sits

    (future) 1m5-core-ts  ──wraps──►  tor_client.TorClient
                                              │
                                 SOCKS5 127.0.0.1:9050
                                 control 127.0.0.1:9051 (probe only)
                                              │
                                      system tor daemon

## No embedded backend (current state - being retired, see TODO.md)

Same reasoning as `tor-client-python`: Rust's `embedded` backend runs
[Arti](https://gitlab.torproject.org/tpo/core/arti), the Tor Project's
pure-**Rust** Tor implementation, in-process — there is no Node/TypeScript
equivalent to embed. So, like `tor-client-java` *used to*, this client only
ever attaches to a Tor instance **installed and running on the host**. No
`Mode`/`Backend` split, no `ra.tor.mode`/`ra.tor.dataDir` config keys.

**No Node/TypeScript Tor implementation is actually needed to fix this.**
`tor-client-java` embeds Tor now by downloading and spawning the same official
C `tor` binary Tor Project itself builds and signs, not by embedding an
in-language reimplementation - `node:child_process` plus built-in
`https`/`crypto` (and a shell-out to `tar` for extraction, Node's one real gap
here - see `TODO.md` P0.5) covers it. Once implemented, "no embedded backend"
here becomes inaccurate and this section should be rewritten, not just
amended.

## Components

    LocalTorDetector   probes SOCKS 9050 + control 9051 (node:net, Promise-based)
    socks              minimal SOCKS5 CONNECT client, no auth (node:net only)
    http               fetchViaSocks / parseUrl / formatGet / splitBody;
                        http:// only, no TLS
    TorClient          config, status, start()/stop()/send() — all async

## Message flow

**Outbound** — a caller sets `envelope.headers["url"]` to a `.onion` or
clearnet `http://` URL and calls `send()`. `fetchViaSocks` opens a SOCKS5
tunnel through `127.0.0.1:9050`, issues a `GET`, and writes the response
body (a `Buffer`) to `envelope.headers["body"]`.

`ra_common.Envelope`'s `headers` field is `Record<string, unknown>` with no
generic byte-payload slot the way `seda_bus::Envelope` does in Rust — same
gap `tor-client-python` hit. Rather than force a `DocumentMessage` on every
caller, this client puts the raw response `Buffer` on
`envelope.headers["body"]`, keeping the same headers-in/headers-out
contract (`headers["url"]` in, `headers["error"]` on failure) every port so
far uses.

**Inbound** — not implemented (see `TODO.md`), same as every other port.

## Status model

`Status` is its own 4-state enum (`Connecting`, `Connected`, `Disconnected`,
`Error`), not `ra_common`'s wider `NetworkStatus` — matches Rust and Python.
`start()` sets `Connecting`, then `Connected` if the daemon answers or
`Disconnected` (resolved `false`, never a rejected promise) if not. `stop()`
→ `Disconnected`.

## Config keys

Same names as `tor-client-rust` / `tor-client-python` (`ra.tor.mode`/
`ra.tor.dataDir` dropped — no embedded mode to select): `ra.tor.host`,
`ra.tor.socksPort`, `ra.tor.controlPort`, `ra.tor.requestTimeoutSecs`.

## TypeScript adaptations vs. the other ports

- **Async by construction.** Node has no blocking socket API, so
  `LocalTorDetector`'s probes, `start()`, and `send()` are all `Promise`-
  returning, unlike Rust/Python's synchronous, blocking calls. This is a
  genuine language-idiom difference, not a scope cut — the request/response
  shape is identical.
- SOCKS5 handshake reads use a small `readExact` helper that buffers
  `"data"` events and pushes any surplus bytes back with `socket.unshift`,
  since `node:net` sockets have no blocking "read exactly N bytes" call the
  way `std::io::Read::read_exact` or Python's `socket.recv` loop does.
- Response body is a `Buffer`, not a byte array/`Vec<u8>` — the natural
  Node type for raw bytes.
- The Tor control protocol client (`TORControlConnection` & friends) is not
  ported, same gap every other port has.

## Not here

- HTTPS (needs `node:tls`'s `TLSSocket` wrapped around the SOCKS socket).
- Tor control protocol: authentication, event stream, `NEWNYM`, circuit info.
- Hidden service (onion) hosting for inbound envelopes.
- Stream isolation per identity / per destination.
- An embedded/bridged backend (see "No embedded backend").
