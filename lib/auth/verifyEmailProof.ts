/**
 * Verify email proof token (cookie or Bearer) for protected public APIs.
 * Used by /api/public/analysis/start and /api/public/reports/persist.
 */

import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const EMAIL_PROOF_SECRET = process.env.EMAIL_PROOF_SECRET || "change-this-secret-in-production";

export interface ProofPayload {
  email: string;
  purpose: string;
  challengeId: string;
  placeId?: string;
  exp: number;
  iat: number;
}

export async function verifyEmailProof(request: NextRequest): Promise<ProofPayload | null> {
  let token = request.cookies.get("email_proof")?.value;
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(EMAIL_PROOF_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload === "object" &&
      payload !== null &&
      "email" in payload &&
      "purpose" in payload &&
      "challengeId" in payload
    ) {
      return payload as unknown as ProofPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Require proof with purpose "unlock_report"; returns 401/403 response or null if valid. */
export function proofErrorResponse(proof: ProofPayload | null): Response | null {
  if (!proof) {
    return new Response(JSON.stringify({ error: "Invalid or missing verification proof" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (proof.purpose !== "unlock_report") {
    return new Response(JSON.stringify({ error: "Invalid proof purpose" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (proof.exp && proof.exp * 1000 < Date.now()) {
    return new Response(JSON.stringify({ error: "Proof token has expired" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
