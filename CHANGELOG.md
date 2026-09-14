# Changelog

## 0.1.0

- Initial local-only Tor client: `LocalTorDetector`, hand-rolled SOCKS5 +
  HTTP/1.1 GET on `node:net`, `TorClient` (`fromConfig`, `start`/`stop`/`send`,
  all async).
- Depends on `@resolvingarchitecture/ra-common` for `Envelope`.
- No embedded backend (see `DESIGN.md`).
