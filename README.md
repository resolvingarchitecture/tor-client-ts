# tor (TypeScript)

A local-only Tor client for **1M5**: attaches to a Tor daemon already
running on this host — SOCKS5 proxy `127.0.0.1:9050`, control port
`127.0.0.1:9051` (probed for readiness only).

A TypeScript port of [`tor-java`](https://github.com/resolvingarchitecture/tor-java);
mirrors the *local* backend of [`tor-rust`](https://github.com/resolvingarchitecture/tor-rust)
(no embedded backend — Arti is Rust-only, see `DESIGN.md`).

**This local-daemon-only model is being retired.** `tor-java` no longer
attaches to a pre-existing Tor instance at all - it downloads the official Tor
Project binary, verifies it, and spawns/owns it directly, so there is no
fallback to some other already-running Tor anywhere in that library. This port
should adopt the same model; see "Embedded Tor (planned)" below and `TODO.md`.

## Embedded Tor (planned)

Not implemented yet. The plan, matching `tor-java`'s current design:

1. Download the official Tor Project "Expert Bundle" for the current
   OS/arch (`process.platform`/`process.arch`) into a local cache (`node:https`
   - built in, no new dependency), verify its SHA-256 against a value pinned
   in this port's own source (`node:crypto`'s `createHash('sha256')` - built
   in; never trusted from the network alongside the download itself).
2. Extract it - unlike Python/Go, Node has no built-in tar-format reader
   (`node:zlib` only handles the gzip layer). Shelling out to the system
   `tar` (matching `tor-java`'s own choice) avoids adding an npm
   dependency just for this.
3. Spawn it (`node:child_process`'s `spawn`) with a generated `torrc`
   (`SocksPort auto`, `ControlPort auto`, real `CookieAuthentication 1`,
   `__OwningControllerProcess <our pid>`).
4. Authenticate over the control port with the real cookie and block until
   Tor reports 100% bootstrap - needs at least a minimal control client
   (`AUTHENTICATE`, `GETINFO status/bootstrap-phase`, `GETINFO
   net/listeners/socks`), a subset of the full control-protocol port already
   tracked in `TODO.md` P2.

## Local Tor daemon setup (current model, being retired)

Install Tor (`apt install tor`, `brew install tor`, …) and make sure
`/etc/tor/torrc` (or `~/.torrc`) has:

```
SocksPort 9050
ControlPort 9051
CookieAuthentication 0
```

Then `systemctl start tor` (or `tor -f ~/.torrc`). Check:
`curl --socks5-hostname 127.0.0.1:9050 https://check.torproject.org/api/ip`.

## Use

```ts
import { Envelope } from "@resolvingarchitecture/ra-common";
import { TorClient } from "@resolvingarchitecture/tor";

const client = TorClient.fromConfig({});
if (await client.start()) {                 // false (cleanly) if Tor is unavailable
  const env = new Envelope();
  env.headers["url"] = "http://example.onion/";
  await client.send(env);                    // body -> env.headers["body"], errors -> env.headers["error"]
}
```

### Config keys

| key | default | meaning |
|-----|---------|---------|
| `ra.tor.host` | `127.0.0.1` | local daemon host |
| `ra.tor.socksPort` | `9050` | local daemon SOCKS5 proxy port |
| `ra.tor.controlPort` | `9051` | local daemon control port (probed only) |
| `ra.tor.requestTimeoutSecs` | `60` | per-request timeout |

## Build

```
npm install
npm test
npm run build
npm run typecheck
```

## Status

Early. HTTP (`http://`) works; HTTPS needs `node:tls` wrapped around the
SOCKS socket (see `TODO.md`). The local daemon's control port is only
probed, not spoken — no event stream or hidden-service management yet.
Inbound / onion hosting is not implemented. See `DESIGN.md` and `TODO.md`.
