/**
 * Dynamic Open Graph image for shareable report /r/[reportId]
 * Renders 1200x630 PNG: background, business logo/name, grade, Powered by Antistatic.
 * Edge runtime: avoids @vercel/og loading Noto Sans from file (Invalid URL on Windows).
 * Base URL for asset fetch comes from request Host header so dev and prod both work.
 */

import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { loadSnapshot } from "@/lib/report/loadSnapshot";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Antistatic report preview";
export const revalidate = 86400;

const GRADE_DISPLAY: Record<string, string> = {
  Poor: "POOR",
  Okay: "WEAK",
  Good: "GOOD",
};

const GRADE_COLOR: Record<string, string> = {
  Poor: "#ff2d2d",
  Okay: "#fbbf24",
  Good: "#22c55e",
};

/** Approximate width of "Online Health Grade:" at 56px Product Sans Medium */
const LABEL_TEXT_WIDTH = 620;

/** Max height of business logo / name slot (px) */
const LOGO_SLOT_HEIGHT = 120;

const BUSINESS_NAME_FONT_SIZE = 72;
const BUSINESS_NAME_FONT_SIZE_MIN = 20;

function splitBusinessName(name: string): { firstLine: string; rest: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const firstLine = words.slice(0, 3).join(" ");
  const rest = words.slice(3).join(" ");
  return { firstLine, rest };
}

/** Font size for the rest line so it fits in the width of the first line (by character ratio). */
function restLineFontSize(firstLine: string, rest: string): number {
  if (!rest || !firstLine) return BUSINESS_NAME_FONT_SIZE;
  const ratio = firstLine.length / rest.length;
  const size = Math.round(BUSINESS_NAME_FONT_SIZE * ratio);
  return Math.min(BUSINESS_NAME_FONT_SIZE, Math.max(BUSINESS_NAME_FONT_SIZE_MIN, size));
}

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") || h.get("x-forwarded-host");
  const proto = h.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "https://www.antistatic.ai";
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fetchAsset(baseUrl: string, path: string): Promise<ArrayBuffer> {
  const pathEncoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = new URL(pathEncoded.startsWith("/") ? pathEncoded : `/${pathEncoded}`, baseUrl + "/").toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.arrayBuffer();
}

type OgFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

async function loadFont(
  baseUrl: string,
  path: string,
  weight: OgFontWeight
): Promise<{ name: string; data: ArrayBuffer; weight: OgFontWeight; style: "normal" }> {
  const data = await fetchAsset(baseUrl, path);
  return { name: "Product Sans", data, weight, style: "normal" };
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;

  let businessName = "Business";
  let logoUrl: string | null = null;
  let label: "Good" | "Okay" | "Poor" = "Okay";
  let gradeDisplay = "WEAK";
  let gradeColor = GRADE_COLOR.Okay;

  const snapshot = await loadSnapshot(reportId);
  if (snapshot) {
    const report = snapshot.report;
    const place = snapshot.place;
    businessName = report.meta?.businessName ?? place.name ?? "Business";
    logoUrl = report.meta?.websiteLogoUrl ?? null;
    const rawLabel = report.scores?.overall?.label ?? "Okay";
    label =
      rawLabel === "Good" || rawLabel === "Okay" || rawLabel === "Poor"
        ? rawLabel
        : "Okay";
    gradeDisplay = GRADE_DISPLAY[label] ?? "WEAK";
    gradeColor = GRADE_COLOR[label] ?? GRADE_COLOR.Okay;
  }

  const baseUrl = (await getBaseUrl()).replace(/\/$/, "");

  const [regularFont, mediumFont, boldFont, bgBuffer, logoSvgBuffer] = await Promise.all([
    loadFont(baseUrl, "/fonts/product-sans/ProductSans-Regular.ttf", 400),
    loadFont(baseUrl, "/fonts/product-sans/ProductSans-Medium.ttf", 500),
    loadFont(baseUrl, "/fonts/product-sans/ProductSans-Bold.ttf", 700),
    fetchAsset(baseUrl, "/images/open graph bg image.png"),
    fetchAsset(baseUrl, "/images/antistatic logo on black.svg").catch(() => null as ArrayBuffer | null),
  ]);

  const bgDataUrl = "data:image/png;base64," + toBase64(bgBuffer);
  const logoDataUrl =
    logoSvgBuffer != null
      ? "data:image/svg+xml;base64," + toBase64(logoSvgBuffer)
      : null;

  let businessLogoFetched: ArrayBuffer | null = null;
  let businessLogoMime = "image/png";
  if (logoUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(logoUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        businessLogoFetched = await res.arrayBuffer();
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("jpeg") || ct.includes("jpg")) businessLogoMime = "image/jpeg";
        else if (ct.includes("webp")) businessLogoMime = "image/webp";
      }
    } catch {
      // use business name as fallback
    }
  }

  const businessLogoDataUrl =
    businessLogoFetched != null
      ? `data:${businessLogoMime};base64,` + toBase64(businessLogoFetched)
      : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Background full-bleed */}
        <img
          src={bgDataUrl}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1200,
            height: 630,
            objectFit: "cover",
          }}
        />
        {/* Content overlay */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "48px 64px 56px",
            fontFamily: "Product Sans",
          }}
        >
          {/* Top: business logo or name */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              flexShrink: 0,
            }}
          >
            {businessLogoDataUrl ? (
              <img
                src={businessLogoDataUrl}
                alt=""
                width={LABEL_TEXT_WIDTH}
                height={LOGO_SLOT_HEIGHT}
                style={{
                  width: LABEL_TEXT_WIDTH,
                  height: LOGO_SLOT_HEIGHT,
                  objectFit: "contain",
                }}
              />
            ) : (() => {
              const { firstLine, rest } = splitBusinessName(businessName);
              const restSize = restLineFontSize(firstLine, rest);
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    height: LOGO_SLOT_HEIGHT,
                    width: LABEL_TEXT_WIDTH,
                  }}
                >
                  <span
                    style={{
                      fontSize: BUSINESS_NAME_FONT_SIZE,
                      fontWeight: 700,
                      color: "white",
                      textAlign: "center",
                      lineHeight: 1.2,
                    }}
                  >
                    {firstLine}
                  </span>
                  {rest ? (
                    <span
                      style={{
                        fontSize: restSize,
                        fontWeight: 700,
                        color: "white",
                        textAlign: "center",
                        lineHeight: 1.2,
                      }}
                    >
                      {rest}
                    </span>
                  ) : null}
                </div>
              );
            })()}
          </div>

          {/* Center: "Online Health Grade:" + grade */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              flex: 1,
            }}
          >
            <span
              style={{
                fontSize: 56,
                fontWeight: 900,
                color: "white",
                textShadow: "0 0 2px rgba(255,255,255,0.8), 0 0 1px white",
              }}
            >
              Online Health Grade:
            </span>
            <span
              style={{
                fontSize: 240,
                fontWeight: 700,
                color: gradeColor,
                lineHeight: 1,
              }}
            >
              {gradeDisplay}
            </span>
          </div>

          {/* Bottom: Powered by + Antistatic logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 40,
                fontWeight: 400,
                color: "white",
              }}
            >
              Powered by
            </span>
            {logoDataUrl ? (
              <img
                src={logoDataUrl}
                alt="Antistatic"
                width={220}
                height={66}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <span
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: "white",
                }}
              >
                Antistatic
              </span>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [regularFont, mediumFont, boldFont],
    }
  );
}
