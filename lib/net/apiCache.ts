/**
 * In-memory LRU cache with TTL for expensive upstream API responses (e.g. Google Places).
 * Runs per Vercel function instance; cold starts get a fresh cache (acceptable).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class ApiCache<T = unknown> {
  private map = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  /**
   * @param maxEntries  Maximum cached items (oldest evicted first). Default 500.
   * @param ttlMs       Time-to-live in ms. Default 300 000 (5 min).
   */
  constructor(maxEntries = 500, ttlMs = 5 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Move to end (most-recently used) for LRU behaviour
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Delete first so re-insert goes to the end of iteration order
    this.map.delete(key);

    // Evict oldest entries if at capacity
    while (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
      else break;
    }

    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined; // also prunes expired
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
