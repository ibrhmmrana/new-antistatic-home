import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Allowed origin hostnames for CORS (match middleware config). */
const PROXY_ALLOWED_HOSTS = new Set([
  "antistatic.ai",
  "www.antistatic.ai",
  "app.antistatic.ai",
  "localhost",
  "127.0.0.1",
]);

function getProxyCorsOrigin(request: NextRequest): string {
  const origin = request.headers.get("origin") ?? "";
  try {
    const host = new URL(origin).hostname;
    if (PROXY_ALLOWED_HOSTS.has(host) || host.endsWith(".vercel.app")) {
      return origin;
    }
  } catch {
    // no valid origin
  }
  return "https://www.antistatic.ai";
}

/**
 * Proxy endpoint to fetch and serve Instagram images
 * This bypasses CORS restrictions by fetching images server-side
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate that it's an Instagram or Facebook CDN URL for security
  const allowedDomains = [
    "cdninstagram.com",
    "fbcdn.net",
    "instagram.com",
    "facebook.com",
  ];

  try {
    const url = new URL(imageUrl);
    const isAllowed = allowedDomains.some((domain) => url.hostname.includes(domain));

    if (!isAllowed) {
      console.error(`[Proxy] Invalid domain: ${url.hostname}`);
      return NextResponse.json({ error: "Invalid image URL domain" }, { status: 400 });
    }

    console.log(`[Proxy] Fetching image from: ${imageUrl.substring(0, 100)}...`);

    // Use different headers for Facebook vs Instagram
    const isFacebook = url.hostname.includes('fbcdn.net') || url.hostname.includes('facebook.com');
    const headers = isFacebook
      ? {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.facebook.com/",
          "Origin": "https://www.facebook.com",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "same-site",
        }
      : {
          "User-Agent": "Instagram 267.0.0.19.301 Android",
          "X-IG-App-ID": "567067343352427",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.instagram.com/",
          "Origin": "https://www.instagram.com",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "same-site",
        };

    // Fetch the image with appropriate headers
    const imageResponse = await fetch(imageUrl, {
      headers,
      redirect: "follow",
    });

    console.log(`[Proxy] Response status: ${imageResponse.status} ${imageResponse.statusText}`);

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text().catch(() => "");
      console.error(`[Proxy] Failed to fetch image: ${imageResponse.status}`, errorText.substring(0, 200));
      return NextResponse.json(
        { error: `Failed to fetch image: ${imageResponse.status}` },
        { status: imageResponse.status }
      );
    }

    // Get the image data
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    
    console.log(`[Proxy] Successfully fetched image, size: ${imageBuffer.byteLength} bytes, type: ${contentType}`);

    // Return the image with appropriate headers (restrict CORS to own domains)
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year
        "Access-Control-Allow-Origin": getProxyCorsOrigin(request),
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch (error) {
    console.error("[Proxy] Error proxying image:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to proxy image: ${errorMessage}` },
      { status: 500 }
    );
  }
}
