/**
 * `TorClient` - the local-only Tor client. Ports `tor-client-rust`'s
 * `TorClient` minus the `Mode`/embedded-backend split: Arti (the pure-Rust
 * Tor implementation `tor-client-rust` embeds) has no TypeScript / Node
 * equivalent, so this port - like `tor-client-java` - only ever attaches to
 * a Tor daemon already running on the host. See `DESIGN.md`.
 */
import type { Envelope } from "@resolvingarchitecture/ra-common";

import { LocalTorDetector, type LocalTorDetectorOptions } from "./detector.js";
import { fetchViaSocks } from "./http.js";

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export enum Status {
  Connecting = "Connecting",
  Connected = "Connected",
  Disconnected = "Disconnected",
  Error = "Error",
}

export type TorClientConfig = Partial<
  Record<"ra.tor.host" | "ra.tor.socksPort" | "ra.tor.controlPort" | "ra.tor.requestTimeoutSecs", string>
>;

/**
 * A Tor client attached to a local Tor daemon's SOCKS proxy (default
 * `127.0.0.1:9050`); the control port (default `9051`) is probed for
 * readiness only - see `TODO.md` for the control protocol.
 */
export class TorClient {
  readonly detector: LocalTorDetector;
  requestTimeoutMs: number;
  private currentStatus: Status = Status.Disconnected;

  constructor(detectorOpts: LocalTorDetectorOptions = {}) {
    this.detector = new LocalTorDetector(detectorOpts);
    this.requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** Config keys: `ra.tor.host`, `ra.tor.socksPort`, `ra.tor.controlPort`,
   * `ra.tor.requestTimeoutSecs`. */
  static fromConfig(cfg: TorClientConfig): TorClient {
    const c = new TorClient();
    if (cfg["ra.tor.host"] !== undefined) c.detector.host = cfg["ra.tor.host"];
    if (cfg["ra.tor.socksPort"] !== undefined) c.detector.socksPort = Number(cfg["ra.tor.socksPort"]);
    if (cfg["ra.tor.controlPort"] !== undefined) c.detector.controlPort = Number(cfg["ra.tor.controlPort"]);
    if (cfg["ra.tor.requestTimeoutSecs"] !== undefined) {
      c.requestTimeoutMs = Number(cfg["ra.tor.requestTimeoutSecs"]) * 1000;
    }
    return c;
  }

  status(): Status {
    return this.currentStatus;
  }

  /** Probe the local daemon. Resolves `false` cleanly (never rejects) if Tor
   * is unavailable. */
  async start(): Promise<boolean> {
    this.currentStatus = Status.Connecting;
    if (!(await this.detector.isLocalTorRunning())) {
      const [socksOk, controlOk] = await Promise.all([
        this.detector.isSocksReachable(),
        this.detector.isControlReachable(),
      ]);
      console.warn(
        `No local Tor daemon on ${this.detector.host} (SOCKS ${this.detector.socksPort} ` +
          `reachable=${socksOk}, control ${this.detector.controlPort} reachable=${controlOk}). ` +
          `Install and run Tor with 'ControlPort 9051' - see README.md.`,
      );
      this.currentStatus = Status.Disconnected;
      return false;
    }
    this.currentStatus = Status.Connected;
    return true;
  }

  stop(): boolean {
    this.currentStatus = Status.Disconnected;
    return true;
  }

  /**
   * Fetch `envelope.headers["url"]` through Tor into
   * `envelope.headers["body"]`. HTTP only for now. On error, records
   * `envelope.headers["error"]`.
   *
   * Uses `headers` rather than a generic payload field - `ra_common.Envelope`
   * carries typed `Message` content, not a raw byte payload, and this client
   * has no opinion on which `Message` subtype a caller wants (same choice
   * `tor-client-python` made).
   */
  async send(envelope: Envelope): Promise<boolean> {
    const url = envelope.headers["url"];
    if (typeof url !== "string" || url.length === 0) {
      envelope.headers["error"] = "no url header";
      return false;
    }
    if (this.currentStatus !== Status.Connected) {
      envelope.headers["error"] = "Tor client not started";
      return false;
    }
    try {
      const body = await fetchViaSocks(this.detector.host, this.detector.socksPort, url, this.requestTimeoutMs);
      envelope.headers["body"] = body;
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`Tor request to ${url} failed: ${message}`);
      envelope.headers["error"] = message;
      return false;
    }
  }
}
