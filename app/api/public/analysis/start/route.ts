import { NextRequest, NextResponse } from "next/server";
import { verifyEmailProof, proofErrorResponse } from "@/lib/auth/verifyEmailProof";

export async function POST(request: NextRequest) {
  try {
    const proof = await verifyEmailProof(request);
    const errResp = proofErrorResponse(proof);
    if (errResp) return errResp;

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
