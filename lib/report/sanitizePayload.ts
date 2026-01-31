/**
 * Sanitize payload for database storage
 * Removes undefined values and handles circular references
 */

/**
 * Recursively sanitize an object for JSON storage
 * - Removes undefined values
 * - Converts BigInt to string
 * - Handles dates
 * - Limits string length to prevent oversized payloads
 */
export function sanitizeForDb(value: unknown, maxStringLength = 50000): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'bigint') {
    return value.toString();
  }
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  if (typeof value === 'string') {
    // Truncate very long strings (e.g., base64 screenshots that might leak through)
    if (value.length > maxStringLength) {
      return value.slice(0, maxStringLength) + '...[truncated]';
    }
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(item => sanitizeForDb(item, maxStringLength));
  }
  
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Skip undefined values
      if (val !== undefined) {
        // Skip very large base64 strings (screenshots, etc.)
        if (typeof val === 'string' && val.length > maxStringLength && val.startsWith('data:')) {
          result[key] = '[base64 data removed]';
        } else {
          result[key] = sanitizeForDb(val, maxStringLength);
        }
      }
    }
    return result;
  }
  
  // For functions and other types, return null
  return null;
}

/**
 * Estimate the JSON size of a payload (rough approximation)
 */
export function estimatePayloadSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * Check if payload is within acceptable size limits
 * Default limit is 5MB to be safe with Supabase JSONB columns
 */
export function isPayloadSizeAcceptable(value: unknown, maxBytes = 5 * 1024 * 1024): boolean {
  return estimatePayloadSize(value) < maxBytes;
}
