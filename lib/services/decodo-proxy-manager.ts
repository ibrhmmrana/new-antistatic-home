/**
 * Decodo residential proxy manager for Instagram scraping.
 * Supports rotation (per-request or per-profile) and sticky sessions with TTL.
 * Never logs credentials.
 */

export type RotationMode = "request" | "profile";

interface ProxyEndpoint {
  host: string;
  port: number;
}

interface StickySession {
  proxyIndex: number;
  expiresAt: number;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const FAILED_PROXY_COOLDOWN_MS = 60_000; // 1 minute before reusing a failed proxy

export class DecodoProxyManager {
  private static instance: DecodoProxyManager | null = null;
  private endpoints: ProxyEndpoint[] = [];
  private nextIndex = 0;
  private stickySessions = new Map<string, StickySession>();
  private failedProxies = new Map<string, number>(); // proxyKey -> cooldownUntil
  private requestCountByStickyKey = new Map<string, number>();

  private constructor() {
    this.loadEndpoints();
  }

  static getInstance(): DecodoProxyManager {
    if (!DecodoProxyManager.instance) {
      DecodoProxyManager.instance = new DecodoProxyManager();
    }
    return DecodoProxyManager.instance;
  }

  static resetInstance(): void {
    DecodoProxyManager.instance = null;
  }

  private loadEndpoints(): void {
    const host = process.env.DECODO_PROXY_HOST;
    const portStr = process.env.DECODO_PROXY_PORT;
    const multi = process.env.DECODO_ENDPOINTS;

    if (multi && multi.trim()) {
      // DECODO_ENDPOINTS=gate.decodo.com:10001,us.gate.decodo.com:10002
      for (const part of multi.split(",").map((s) => s.trim())) {
        if (!part) continue;
        const [h, p] = part.split(":");
        const port = p ? parseInt(p, 10) : 10001;
        if (h && !isNaN(port)) {
          this.endpoints.push({ host: h.trim(), port });
        }
      }
    }

    if (this.endpoints.length === 0 && host && portStr) {
      const port = parseInt(portStr, 10);
      if (!isNaN(port)) {
        this.endpoints.push({ host: host.trim(), port });
      }
    }

    if (this.endpoints.length === 0) {
      this.endpoints.push({ host: "gate.decodo.com", port: 10001 });
    }
  }

  /**
   * Returns proxy URL for the next request. Same stickyKey reuses the same proxy until TTL expires (profile mode).
   * Never log the returned string (contains credentials).
   */
  getProxyForRequest(stickyKey?: string, rotationMode?: RotationMode): string | null {
    const user = process.env.DECODO_PROXY_USER;
    const pass = process.env.DECODO_PROXY_PASS;
    if (!user || !pass) return null;
    if (this.endpoints.length === 0) return null;

    const ttlSec = Math.max(0, parseInt(process.env.DECODO_STICKY_TTL_SECONDS ?? "300", 10) || 300);
    const mode: RotationMode = (rotationMode ?? (process.env.DECODO_ROTATION_MODE as RotationMode) ?? "request") === "profile" ? "profile" : "request";

    let proxyIndex: number;

    if (mode === "profile" && stickyKey) {
      const now = Date.now();
      const existing = this.stickySessions.get(stickyKey);
      if (existing && existing.expiresAt > now) {
        proxyIndex = existing.proxyIndex;
      } else {
        proxyIndex = this.pickNextAvailableIndex();
        this.stickySessions.set(stickyKey, {
          proxyIndex,
          expiresAt: now + ttlSec * 1000,
        });
      }
    } else {
      proxyIndex = this.pickNextAvailableIndex();
    }

    const ep = this.endpoints[proxyIndex % this.endpoints.length];
    const proxyKey = `${ep.host}:${ep.port}`;
    const cooldownUntil = this.failedProxies.get(proxyKey) ?? 0;
    if (Date.now() < cooldownUntil) {
      // This proxy is in cooldown; try next
      const nextProxyIndex = (proxyIndex + 1) % this.endpoints.length;
      const nextEp = this.endpoints[nextProxyIndex];
      return this.buildProxyUrl(nextEp.host, nextEp.port, user, pass);
    }

    if (stickyKey) {
      const count = (this.requestCountByStickyKey.get(stickyKey) ?? 0) + 1;
      this.requestCountByStickyKey.set(stickyKey, count);
    }

    return this.buildProxyUrl(ep.host, ep.port, user, pass);
  }

  private pickNextAvailableIndex(): number {
    const idx = this.nextIndex % Math.max(1, this.endpoints.length);
    this.nextIndex = idx + 1;
    return idx;
  }

  private buildProxyUrl(host: string, port: number, user: string, pass: string): string {
    const encodedUser = encodeURIComponent(user);
    const encodedPass = encodeURIComponent(pass);
    return `http://${encodedUser}:${encodedPass}@${host}:${port}`;
  }

  /**
   * Call when a proxy returned 429 or connection failure. Temporarily avoids that proxy.
   */
  markProxyFailed(proxyUrl: string): void {
    try {
      const u = new URL(proxyUrl);
      const key = `${u.hostname}:${u.port || "80"}`;
      this.failedProxies.set(key, Date.now() + FAILED_PROXY_COOLDOWN_MS);
    } catch {
      // ignore
    }
  }

  /**
   * Redacted proxy URL for logging (host:port only, no credentials).
   */
  static redactProxyUrl(proxyUrl: string): string {
    try {
      const u = new URL(proxyUrl);
      return `${u.hostname}:${u.port || "80"}`;
    } catch {
      return "***";
    }
  }

  getRequestCount(stickyKey: string): number {
    return this.requestCountByStickyKey.get(stickyKey) ?? 0;
  }

  getEndpointCount(): number {
    return this.endpoints.length;
  }

  isConfigured(): boolean {
    return !!(process.env.DECODO_PROXY_USER && process.env.DECODO_PROXY_PASS && this.endpoints.length > 0);
  }
}
