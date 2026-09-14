/**
 * Detects a local Tor daemon.
 *
 * Ports `tor-client-rust`'s `detector` module (itself a port of
 * `tor-client-java`'s `LocalTorDetector`). Tor is a C daemon - unlike I2P,
 * which has a pure-language router this project can embed - so every
 * language port only ever attaches to a Tor instance already installed and
 * running on the host.
 */
import { Socket } from "node:net";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_SOCKS_PORT = 9050;
export const DEFAULT_CONTROL_PORT = 9051;
export const DEFAULT_TIMEOUT_MS = 750;

export interface LocalTorDetectorOptions {
  host?: string;
  socksPort?: number;
  controlPort?: number;
  timeoutMs?: number;
}

/**
 * Probes SOCKS + control ports so {@link TorClient.start} can fail fast with
 * a clear message instead of a confusing connection error later.
 */
export class LocalTorDetector {
  host: string;
  socksPort: number;
  controlPort: number;
  timeoutMs: number;

  constructor(opts: LocalTorDetectorOptions = {}) {
    this.host = opts.host ?? DEFAULT_HOST;
    this.socksPort = opts.socksPort ?? DEFAULT_SOCKS_PORT;
    this.controlPort = opts.controlPort ?? DEFAULT_CONTROL_PORT;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isSocksReachable(): Promise<boolean> {
    return this.reachable(this.socksPort);
  }

  isControlReachable(): Promise<boolean> {
    return this.reachable(this.controlPort);
  }

  /** True only if both the SOCKS proxy and the control port answer. */
  async isLocalTorRunning(): Promise<boolean> {
    const [socks, control] = await Promise.all([
      this.isSocksReachable(),
      this.isControlReachable(),
    ]);
    return socks && control;
  }

  private reachable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new Socket();
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(this.timeoutMs);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.connect(port, this.host);
    });
  }
}
