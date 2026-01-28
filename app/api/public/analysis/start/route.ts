import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const EMAIL_PROOF_SECRET = process.env.EMAIL_PROOF_SECRET || "change-this-secret-in-production";

interface ProofPayload {
  email: string;
  purpose: string;
  challengeId: string;
  placeId?: string;
  exp: number;
  iat: number;
}

async function verifyProofToken(request: NextRequest): Promise<ProofPayload | null> {
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
    return null;
  }

  try {
    const secret = new TextEncoder().encode(EMAIL_PROOF_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    return payload as ProofPayload;
  } catch (error) {
    console.error("Token verification error:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify proof token
    const proof = await verifyProofToken(request);

    if (!proof) {
      return NextResponse.json(
        { error: "Invalid or missing verification proof" },
        { status: 401 }
      );
    }

    // Check purpose
    if (proof.purpose !== "unlock_report") {
      return NextResponse.json(
        { error: "Invalid proof purpose" },
        { status: 403 }
      );
    }

    // Check expiration (jwtVerify already checks this, but double-check)
    if (proof.exp && proof.exp * 1000 < Date.now()) {
      return NextResponse.json(
        { error: "Proof token has expired" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { scanId, placeId, placeName, address } = body;

    if (!scanId || !placeId) {
      return NextResponse.json(
        { error: "scanId and placeId are required" },
        { status: 400 }
      );
    }

    // TODO: Here you would:
    // 1. Create a lead/analysis_request row in your database
    // 2. Enqueue the real analysis pipeline (call existing internal function/n8n webhook)
    // 3. Return a jobId for tracking

    // For now, return a mock jobId
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log("[ANALYSIS START] Verified request:", {
      email: proof.email,
      scanId,
      placeId,
      placeName,
      address,
      jobId,
    });

    // In production, you would trigger your analysis pipeline here
    // Example:
    // await triggerAnalysisPipeline({ scanId, placeId, placeName, address, email: proof.email });

    return NextResponse.json({
      success: true,
      jobId,
      message: "Analysis started",
    });
  } catch (error: any) {
    console.error("Start analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
