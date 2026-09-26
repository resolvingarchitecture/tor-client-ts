# tor-client (TypeScript) — TODO

## P0 — local client (done)

- [x] `LocalTorDetector` (probe SOCKS 9050 + control 9051, Promise-based);
      `start()` resolves `false` with an actionable console warning when no
      daemon is reachable.
- [x] Hand-rolled SOCKS5 CONNECT (no auth) on `node:net`.
- [x] HTTP/1.1 GET through the SOCKS tunnel; response `Buffer` on
      `envelope.headers["body"]`.
- [x] Config keys aligned with `tor-client-rust` / `tor-client-python`:
      `ra.tor.host`, `ra.tor.socksPort`, `ra.tor.controlPort`,
      `ra.tor.requestTimeoutSecs`.

## P0.5 — Embedded Tor (planned, matching tor-client-java's new model)

`tor-client-java` no longer attaches to a pre-existing Tor daemon at all - it
downloads the official Tor Project binary, verifies it, and spawns/owns it
directly (see its README.md "Trust model" / DESIGN.md "Why embedded"). Not
started here yet:

- [ ] `TorBinary`-equivalent: resolve OS/arch (`process.platform`/
      `process.arch`), download the official Tor Project Expert Bundle into a
      local cache (first run only, `node:https` - built in), verify its
      SHA-256 (`node:crypto`'s `createHash('sha256')`) against a value pinned
      in this port's own source (never trusted from the network alongside the
      download). Unlike Python/Go, Node has no built-in tar-format reader
      (only `node:zlib`'s gzip layer) - shell out to the system `tar` (matches
      `tor-client-java`'s own choice) rather than adding an npm dependency.
- [ ] `EmbeddedTor`-equivalent: spawn via `node:child_process`'s `spawn` with
      a generated `torrc` (`SocksPort auto`, `ControlPort auto`, real
      `CookieAuthentication 1`, `__OwningControllerProcess <our pid>`).
- [ ] A *minimal* control client - `AUTHENTICATE` with the real cookie,
      `GETINFO status/bootstrap-phase` (poll until `PROGRESS=100`), `GETINFO
      net/listeners/socks` - a subset of the full `TORControlConnection` port
      in P2 below; P0.5 doesn't need the rest of P2 to land first.
- [ ] Never fall back to attaching to some other Tor instance if provisioning
      or bootstrap fails - fail closed (`start()` resolves `false`, never
      rejects), matching every other port's existing "fails cleanly" contract.

## P1 — request path

- [ ] HTTPS (`node:tls`'s `TLSSocket` wrapped around the SOCKS socket).
- [ ] Follow redirects; surface status code + headers.
- [ ] Reuse the SOCKS connection / a small pool instead of one per request.
- [ ] Configurable `User-Agent`; strip identifying headers by default.
- [ ] `AbortSignal` support on `send()` for caller-driven cancellation.

## P2 — Tor control protocol

- [ ] Port `TORControlConnection` / `TORControlCommands` from
      `tor-client-java` (authenticate with `CookieAuthentication 0` or a
      control password).
- [ ] Async event stream (`SETEVENTS`) → map `CIRC` / `STATUS_CLIENT` onto
      `Status`; live readiness instead of a one-shot probe.
- [ ] `NEWNYM` (new circuit) on demand.

## P3 — inbound / hidden service

- [ ] Create or load an onion service key, `ADD_ONION` via the control port.
- [ ] Accept connections on the HS target port, turn requests into
      `Envelope`s (mirrors `tor-client-java`'s HS handler).

## P4 — privacy hardening

- [ ] Stream isolation: distinct SOCKS credentials per identity / destination.
- [ ] Optional bridge / pluggable-transport config passthrough (needs the
      system Tor's own bridge config — no embedded backend here to configure).

## Testing / ops

- [ ] Integration test behind a flag/tag that uses a real local Tor daemon.
- [x] Fake-SOCKS-proxy integration test (`test/client.test.ts`), no live
      network.
- [ ] CI: `npm test`, `npm run typecheck`.
- [ ] Publish to npm once the API settles (currently `file:` dependency only).

## Cross-repo

- [ ] Keep `Status` and config keys aligned with `tor-client-java` 1.2.x and
      `tor-client-rust`'s local backend.
- [ ] Wire into a future `1m5-core-ts`'s protocol-service adapter, same
      pattern as `NetworkServiceProtocol`/`TorProtocolService` in
      `1m5-core-java` and `1m5-core-rust`.
