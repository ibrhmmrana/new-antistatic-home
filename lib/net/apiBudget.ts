/**
 * API Budget Tracker & Circuit Breaker
 *
 * Tracks total external API calls per service and enforces hard limits to prevent
 * runaway costs from bugs, infinite loops, or abuse.
 *
 * Runs per Vercel function instance (resets on cold start, which is acceptable
 * since cold starts are rare and each instance handles limited concurrent requests).
 *
 * Usage:
 *   import { apiBudget } from "@/lib/net/apiBudget";
 *   if (!apiBudget.canCall("google-places")) throw new Error("Budget exceeded");
 *   apiBudget.record("google-places");
 *
 * Services tracked:
 *   - "google-places"   (Places API: Details, Nearby, Autocomplete, Photos, etc.)
 *   - "google-cse"      (Custom Search Engine)
 *   - "google-maps"     (Static Maps, Directions)
 *   - "openai"          (ChatCompletion / GPT calls)
 *   - "ses"             (AWS SES email sends)
 *   - "instagram"       (Instagram scraping / API)
 *   - "playwright"      (Browser automation: website crawl, screenshots)
 */

// ---------------------------------------------------------------------------
// Budget configuration per service
// ---------------------------------------------------------------------------

interface BudgetConfig {
  /** Max calls allowed per time window. */
  maxCalls: number;
  /** Time window in milliseconds. */
  windowMs: number;
  /** Friendly label for logs. */
  label: string;
}

const BUDGET_CONFIGS: Record<string, BudgetConfig> = {
  "google-places": {
    maxCalls: 500,          // 500 Places API calls per 10 minutes
    windowMs: 10 * 60_000,
    label: "Google Places API",
  },
  "google-cse": {
    maxCalls: 100,          // 100 CSE calls per 10 minutes
    windowMs: 10 * 60_000,
    label: "Google Custom Search",
  },
  "google-maps": {
    maxCalls: 200,          // 200 Maps calls per 10 minutes
    windowMs: 10 * 60_000,
    label: "Google Maps API",
  },
  "openai": {
    maxCalls: 100,          // 100 OpenAI calls per 10 minutes
    windowMs: 10 * 60_000,
    label: "OpenAI API",
  },
  "ses": {
    maxCalls: 50,           // 50 emails per 10 minutes
    windowMs: 10 * 60_000,
    label: "AWS SES",
  },
  "instagram": {
    maxCalls: 50,           // 50 Instagram calls per 10 minutes
    windowMs: 10 * 60_000,
    label: "Instagram API",
  },
  "playwright": {
    maxCalls: 30,           // 30 browser sessions per 10 minutes
    windowMs: 10 * 60_000,
    label: "Playwright (browser)",
  },
};

// ---------------------------------------------------------------------------
// Budget tracker
// ---------------------------------------------------------------------------

interface BucketEntry {
  timestamps: number[];
}

class ApiBudgetTracker {
  private buckets = new Map<string, BucketEntry>();
  private tripped = new Map<string, number>(); // service -> trip timestamp
  private lastCleanup = Date.now();

  /**
   * Check if a call is allowed for a service.
   * Returns false if the budget is exceeded (circuit is open).
   */
  canCall(service: string): boolean {
    const config = BUDGET_CONFIGS[service];
    if (!config) return true; // Unknown service: allow (no budget defined)

    // Check if circuit breaker is tripped (cooldown period = windowMs)
    const tripTime = this.tripped.get(service);
    if (tripTime) {
      if (Date.now() - tripTime < config.windowMs) {
        return false; // Still in cooldown
      }
      // Cooldown expired: reset circuit
      this.tripped.delete(service);
    }

    this.cleanup();

    const now = Date.now();
    const cutoff = now - config.windowMs;
    const entry = this.buckets.get(service);
    if (!entry) return true;

    const recentCalls = entry.timestamps.filter((t) => t > cutoff).length;
    return recentCalls < config.maxCalls;
  }

  /**
   * Record a call for a service.
   * If this trips the budget, the circuit breaker opens and all further calls
   * for this service are blocked until the cooldown expires.
   */
  record(service: string): void {
    const now = Date.now();
    let entry = this.buckets.get(service);
    if (!entry) {
      entry = { timestamps: [] };
      this.buckets.set(service, entry);
    }
    entry.timestamps.push(now);

    // Check if we just tripped the limit
    const config = BUDGET_CONFIGS[service];
    if (config) {
      const cutoff = now - config.windowMs;
      const recentCalls = entry.timestamps.filter((t) => t > cutoff).length;
      if (recentCalls >= config.maxCalls) {
        this.tripped.set(service, now);
        console.error(
          `[API BUDGET] CIRCUIT BREAKER TRIPPED for ${config.label}: ` +
          `${recentCalls} calls in ${config.windowMs / 60_000} min (limit: ${config.maxCalls}). ` +
          `All ${config.label} calls blocked for ${config.windowMs / 60_000} min.`
        );
      }
    }
  }

  /**
   * Check + record in one call. Throws if budget is exceeded.
   */
  spend(service: string): void {
    if (!this.canCall(service)) {
      const config = BUDGET_CONFIGS[service];
      const label = config?.label ?? service;
      throw new ApiBudgetExceededError(
        `[API BUDGET] ${label} budget exceeded. ` +
        `Max ${config?.maxCalls ?? "?"} calls per ${(config?.windowMs ?? 0) / 60_000} min. ` +
        `Circuit breaker is open. Please wait and try again.`
      );
    }
    this.record(service);
  }

  /**
   * Get current usage stats for a service.
   */
  getUsage(service: string): { calls: number; limit: number; tripped: boolean } {
    const config = BUDGET_CONFIGS[service];
    if (!config) return { calls: 0, limit: Infinity, tripped: false };

    const now = Date.now();
    const cutoff = now - config.windowMs;
    const entry = this.buckets.get(service);
    const calls = entry
      ? entry.timestamps.filter((t) => t > cutoff).length
      : 0;

    return {
      calls,
      limit: config.maxCalls,
      tripped: this.tripped.has(service),
    };
  }

  /** Periodic cleanup to prevent memory growth. */
  private cleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < 60_000) return;
    this.lastCleanup = now;

    for (const [service, entry] of this.buckets) {
      const config = BUDGET_CONFIGS[service];
      const windowMs = config?.windowMs ?? 600_000;
      const cutoff = now - windowMs;
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) this.buckets.delete(service);
    }

    // Clean up expired circuit breaker trips
    for (const [service, tripTime] of this.tripped) {
      const config = BUDGET_CONFIGS[service];
      const windowMs = config?.windowMs ?? 600_000;
      if (now - tripTime >= windowMs) {
        this.tripped.delete(service);
      }
    }
  }
}

// Custom error class so callers can catch budget errors specifically
export class ApiBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiBudgetExceededError";
  }
}

// Singleton instance shared across all imports in the same function instance
export const apiBudget = new ApiBudgetTracker();
