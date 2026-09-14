/**
 * tor-client: a local-only Tor client for 1M5, in TypeScript / Node.
 *
 * Attaches to a Tor daemon already running on the host via its SOCKS proxy
 * (`127.0.0.1:9050`); the control port (`9051`) is probed for readiness
 * only. A TypeScript port of `tor-client-java` / `tor-client-rust`'s local
 * backend - see `DESIGN.md` for why there is no embedded backend here.
 *
 * @packageDocumentation
 */
export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  Status,
  TorClient,
  type TorClientConfig,
} from "./client.js";
export {
  DEFAULT_CONTROL_PORT,
  DEFAULT_HOST,
  DEFAULT_SOCKS_PORT,
  DEFAULT_TIMEOUT_MS,
  LocalTorDetector,
  type LocalTorDetectorOptions,
} from "./detector.js";
export { fetchViaSocks, formatGet, parseUrl, splitBody, type ParsedUrl } from "./http.js";

export const version = "0.1.0";
