/**
 * Email Proof Verification
 * Verifies JWT proof tokens from email verification flow
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getEmailProofSecret(): string {
  const secret = process.env.EMAIL_PROOF_SECRET;
  if (!secret) {
    throw new Error("[SECURITY] EMAIL_PROOF_SECRET environment variable is not set. Cannot verify tokens.");
  }
  return secret;
}

export interface ProofPayload {
  email: string;
  purpose: string;
  challengeId: string;
  placeId?: string | null;
  exp: number;
  iat: number;
}

export interface ProofResult {
  valid: boolean;
  payload?: ProofPayload;
  error?: string;
}

/**
 * Verify email proof token from request
 * Checks both cookie and Authorization header
 */
export async function verifyEmailProof(request: NextRequest): Promise<ProofResult> {
  // Try to get token from cookie first
  let token = request.cookies.get("email_proof")?.value;

  // Fallback to Authorization header
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return { valid: false, error: "No proof token provided" };
  }

  try {
    const secret = new TextEncoder().encode(getEmailProofSecret());
    const { payload } = await jwtVerify(token, secret);
    
    // Validate payload structure
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'email' in payload &&
      'purpose' in payload &&
      'challengeId' in payload
    ) {
      // Check purpose
      if (payload.purpose !== "unlock_report") {
        return { valid: false, error: "Invalid proof purpose" };
      }
      
      return { 
        valid: true, 
        payload: payload as unknown as ProofPayload 
      };
    }
    
    return { valid: false, error: "Invalid proof payload structure" };
  } catch (error) {
    console.error("Token verification error:", error);
    return { valid: false, error: "Invalid or expired proof token" };
  }
}

/**
 * Generate error response if proof is invalid
 * Returns null if proof is valid
 */
export function proofErrorResponse(result: ProofResult): NextResponse | null {
  if (result.valid) {
    return null;
  }
  
  return NextResponse.json(
    { error: result.error || "Invalid verification proof" },
    { status: 401 }
  );
}
