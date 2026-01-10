/**
 * Generates a short unique scan ID (10-12 characters)
 * Uses a combination of timestamp and random characters
 */
export function generateScanId(): string {
  // Get timestamp in base36 (shorter representation)
  const timestamp = Date.now().toString(36);
  
  // Generate random string
  const random = Math.random().toString(36).substring(2, 8);
  
  // Combine and take first 10-12 chars
  const combined = timestamp + random;
  return combined.substring(0, 12);
}

