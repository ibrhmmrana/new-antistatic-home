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
const FAILED_PROXY_COOLDOWN_MS = 30_000; // 30s before reusing a failed proxy
const STICKY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (align with Decodo "Sticky 10min")

export class DecodoProxyManager {
  private static instance: DecodoProxyManager | null = null;
  private endpoints: ProxyEndpoint[] = [];
  private nextIndex = 0;
  private stickySessions = new Map<string, StickySession>();
  private failedProxies = new Map<string, number>(); // proxyKey -> cooldownUntil
  private requestCountByStickyKey = new Map<string, number>();
  /** Last session label used (redacted) for logging. */
  private lastSessionLabel: string | null = null;

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

    const ttlSec = Math.max(0, parseInt(process.env.DECODO_STICKY_TTL_SECONDS ?? "600", 10) || 600);
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

    const sessionId = this.generateSessionId(stickyKey ?? "default", mode);
    this.lastSessionLabel = this.redactSessionLabel(sessionId);

    const ep = this.endpoints[proxyIndex % this.endpoints.length];

    // In profile mode, always use the sticky endpoint (ignoring cooldown).
    // Switching endpoints mid-scrape (e.g. between auth and profile) is worse for Instagram
    // than retrying on the same (possibly rate-limited) endpoint.
    if (mode === "profile" && stickyKey) {
      const count = (this.requestCountByStickyKey.get(stickyKey) ?? 0) + 1;
      this.requestCountByStickyKey.set(stickyKey, count);
      return this.buildProxyUrl(ep.host, ep.port, user, pass, sessionId);
    }

    // In request mode, skip endpoint if in cooldown
    const proxyKey = `${ep.host}:${ep.port}`;
    const cooldownUntil = this.failedProxies.get(proxyKey) ?? 0;
    if (Date.now() < cooldownUntil) {
      const nextProxyIndex = (proxyIndex + 1) % this.endpoints.length;
      const nextEp = this.endpoints[nextProxyIndex];
      return this.buildProxyUrl(nextEp.host, nextEp.port, user, pass, sessionId);
    }

    if (stickyKey) {
      const count = (this.requestCountByStickyKey.get(stickyKey) ?? 0) + 1;
      this.requestCountByStickyKey.set(stickyKey, count);
    }

    return this.buildProxyUrl(ep.host, ep.port, user, pass, sessionId);
  }

  /**
   * Session ID for Decodo sticky sessions. Same ID = same residential IP.
   * - profile: same session per stickyKey for 10-minute windows (alphanumeric only for Decodo username).
   * - request: new session per request.
   */
  private generateSessionId(stickyKey: string, rotationMode: RotationMode): string {
    // Decodo session IDs must be alphanumeric (embedded in username via -session-{id})
    const safeStickyKey = stickyKey.replace(/[^a-zA-Z0-9]/g, "");
    if (rotationMode === "profile") {
      const tenMinWindow = Math.floor(Date.now() / STICKY_WINDOW_MS);
      return `${safeStickyKey}${tenMinWindow}`;
    }
    return `${safeStickyKey}${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  }

  private redactSessionLabel(sessionId: string): string {
    if (sessionId.length <= 16) return `${sessionId.slice(0, 8)}***`;
    return `${sessionId.slice(0, 8)}***${sessionId.slice(-4)}`;
  }

  getLastSessionLabel(): string | null {
    return this.lastSessionLabel;
  }

  private pickNextAvailableIndex(): number {
    const idx = this.nextIndex % Math.max(1, this.endpoints.length);
    this.nextIndex = idx + 1;
    return idx;
  }

  /**
   * Build proxy URL for undici ProxyAgent.
   *
   * In Decodo HTTP protocol mode (username starts with "user-"), the session ID is injected
   * into the username as "-session-{id}" so Decodo keeps the same residential IP.
   * Example: user-spufne5iws-session-abc123-continent-eu
   *
   * In endpoint:port mode (plain username), session cannot be embedded; we rely on
   * app-side stickiness (same endpoint per stickyKey).
   *
   * URL must NOT include query or path (undici parseOrigin rejects them).
   */
  private buildProxyUrl(host: string, port: number, user: string, pass: string, sessionId?: string): string {
    let effectiveUser = user;

    // Decodo HTTP protocol mode: username starts with "user-"
    // Inject -session-{id} for IP stickiness
    if (sessionId && user.startsWith("user-")) {
      // Strip any existing session param
      effectiveUser = effectiveUser.replace(/-session-[A-Za-z0-9]+/, "");
      // Find end of base username (user-{id}) and inject session before geo params
      const parts = effectiveUser.split("-");
      // parts[0] = "user", parts[1] = username, rest = geo params (continent, country, etc.)
      const base = parts.slice(0, 2).join("-");
      const geoParams = parts.slice(2).join("-");
      effectiveUser = geoParams
        ? `${base}-session-${sessionId}-${geoParams}`
        : `${base}-session-${sessionId}`;
    }

    const encodedUser = encodeURIComponent(effectiveUser);
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
