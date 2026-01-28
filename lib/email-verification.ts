import crypto from "crypto";

/**
 * Hash a verification code using SHA-256 with server secret salt
 */
export function hashCode(code: string): string {
  const salt = process.env.EMAIL_VERIFICATION_SALT || process.env.EMAIL_PROOF_SECRET || "default-salt-change-in-production";
  return crypto
    .createHash("sha256")
    .update(code + salt)
    .digest("hex");
}

/**
 * Verify a code against a hash
 */
export function verifyCode(code: string, hash: string): boolean {
  return hashCode(code) === hash;
}

/**
 * Generate a random 6-digit code
 */
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if user is already verified (from cookie or sessionStorage)
 * This is a client-side helper
 */
export function isEmailVerified(placeId: string): boolean {
  if (typeof window === "undefined") return false;
  
  // Check sessionStorage fallback
  const stored = sessionStorage.getItem(`email_verified_${placeId}`);
  return !!stored;
}
