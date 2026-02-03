import { NextResponse } from "next/server";
import { fetchInstagram } from "@/lib/net/instagramFetch";
import { DecodoProxyManager } from "@/lib/services/decodo-proxy-manager";

export const runtime = "nodejs";

/**
 * GET /api/test/proxy-test
 * Tests Decodo proxy connectivity by fetching external IP through fetchInstagram.
 * When DECODO_ENABLED=true, the request goes through the proxy; otherwise direct.
 * Never returns or logs credentials.
 */
export async function GET() {
  const proxyManager = DecodoProxyManager.getInstance();
  const proxyUsed = proxyManager.isConfigured() && (process.env.DECODO_ENABLED === "true" || process.env.USE_DECODO_PROXY === "true");

  try {
    const testUrl = "https://api.ipify.org?format=json";
    const response = await fetchInstagram(
      testUrl,
      { method: "GET", cache: "no-store" },
      {
        logContext: "proxy-test",
        timeoutMs: 10000,
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `IP check failed: ${response.status} ${response.statusText}`,
          proxyUsed,
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as { ip?: string };
    const ip = data?.ip ?? "unknown";

    return NextResponse.json({
      success: true,
      proxyUsed,
      yourIp: ip,
      endpointCount: proxyManager.getEndpointCount(),
      message: proxyUsed
        ? "Request was routed through Decodo proxy."
        : "Proxy disabled or not configured; request was direct.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[PROXY-TEST] Error:", message);
    return NextResponse.json(
      {
        success: false,
        error: message,
        proxyUsed,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
