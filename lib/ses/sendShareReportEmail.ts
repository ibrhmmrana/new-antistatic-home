/**
 * Send "Someone shared a report with you" email with link to view the report.
 * From: hello@antistatic.ai
 * Uses same logo, layout, and dark mode styles as other Antistatic emails.
 * No em dashes in subject or body.
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { apiBudget } from "@/lib/net/apiBudget";

const FROM_EMAIL = process.env.REPORT_EMAIL_FROM || "hello@antistatic.ai";
const LOGO_URL =
  "https://bmkdwnfrldoqvduhpgsu.supabase.co/storage/v1/object/public/Storage/antistatic-logo-on-white%20(1).png";

export interface SendShareReportEmailParams {
  to: string;
  reportUrl: string;
  businessName: string | null;
  /** Sharer's display name (e.g. from verified email); when set, used in "X shared a report with you" */
  sharerDisplayName?: string | null;
}

// Module icon URLs (hosted PNGs for email client compatibility)
const ICON_REPUTATION =
  "https://bmkdwnfrldoqvduhpgsu.supabase.co/storage/v1/object/public/Storage/reputationHubIcon.png";
const ICON_RADAR =
  "https://bmkdwnfrldoqvduhpgsu.supabase.co/storage/v1/object/public/Storage/competitorRadarIcon.png";
const ICON_SOCIAL =
  "https://bmkdwnfrldoqvduhpgsu.supabase.co/storage/v1/object/public/Storage/socialStudioIcon.png";
const ICON_CREATOR =
  "https://bmkdwnfrldoqvduhpgsu.supabase.co/storage/v1/object/public/Storage/creatorHubIcon.png";

export async function sendShareReportEmail({
  to,
  reportUrl,
  businessName,
  sharerDisplayName,
}: SendShareReportEmailParams): Promise<void> {
  const ses = new SESClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  const fromWithName = `Antistatic <${FROM_EMAIL}>`;

  const subject = businessName
    ? `${businessName}'s online presence report`
    : "An online presence report has been shared with you";

  const businessRef = businessName ? businessName : "a business";

  const sharerLabel = sharerDisplayName?.trim() || "Someone";
  const heroHeading =
    sharerLabel === "Someone"
      ? "Someone shared a business<br/>health report with you"
      : `${sharerDisplayName!.replace(/</g, "&lt;").replace(/>/g, "&gt;")} shared a business<br/>health report with you`;

  const preheader = businessName
    ? `${sharerLabel} shared ${businessName}'s online presence report with you. Open it in your browser.`
    : `${sharerLabel} shared an online presence report with you. Open it in your browser.`;

  const htmlBody = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>Online presence report</title>
  <style>
    :root { color-scheme: light only; }
    html, body { -webkit-color-scheme: light only; color-scheme: light only; }
  </style>
</head>

<body style="margin:0;padding:0;background:#f3f4f6;color-scheme:light only;-webkit-color-scheme:light only;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <!-- Main card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">

          <!-- Dark hero banner -->
          <tr>
            <td align="center" style="background:#0C0824;padding:40px 34px 32px 34px;">
              <div style="text-align:center;margin-bottom:28px;">
                <img src="${LOGO_URL}"
                     width="280" height="46" alt="Antistatic"
                     style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:280px;height:46px;object-fit:contain;" />
              </div>
              <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                         font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;text-align:center;">
                ${heroHeading}
              </h1>
              <p style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:15px;line-height:1.65;color:#c4c8d4;text-align:center;">
                We analysed <strong style="color:#ffffff;">${businessRef}</strong>'s entire digital footprint and scored it across search visibility, website performance, local listings, and online reputation. The results are ready for you.
              </p>
              <p style="margin:0;text-align:center;">
                <a href="${reportUrl}"
                   style="display:inline-block;background:#2563eb;color:#ffffff !important;padding:14px 36px;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                  View the full report
                </a>
              </p>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding:32px 34px 0 34px;">

              <!-- Section intro -->
              <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:11px;line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;text-align:center;">
                What Antistatic does for your business
              </p>
              <h2 style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                         font-size:22px;line-height:1.3;font-weight:700;color:#111827;text-align:center;">
                Four engines. One platform.
              </h2>
              <p style="margin:0 0 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:14px;line-height:1.7;color:#4b5563;text-align:center;">
                Every tool you need to protect your reputation, outpace competitors, and turn online visibility into real revenue.
              </p>

              <!-- Modules: 2x2 grid with gap (padding on td, block styles on inner div) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <!-- Row 1 -->
                <tr>
                  <td width="50%" valign="top" style="padding:6px;">
                    <div style="background:#f5f3ff;border-radius:12px;border:1px solid #ede9fe;padding:22px 20px;">
                      <p style="margin:0 0 10px 0;line-height:1;">
                        <img src="${ICON_REPUTATION}" width="28" height="28" alt=""
                             style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:28px;max-width:28px;max-height:28px;object-fit:contain;" />
                      </p>
                      <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:14px;line-height:1.3;font-weight:700;color:#111827;">
                        Reputation Hub
                      </p>
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:12px;line-height:1.55;color:#4b5563;">
                        Request reviews via WhatsApp, email, and SMS. Every review from Google and socials in one feed.
                      </p>
                    </div>
                  </td>
                  <td width="50%" valign="top" style="padding:6px;">
                    <div style="background:#0C0824;border-radius:12px;padding:22px 20px;">
                      <p style="margin:0 0 10px 0;line-height:1;">
                        <img src="${ICON_RADAR}" width="28" height="28" alt=""
                             style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:28px;max-width:28px;max-height:28px;object-fit:contain;" />
                      </p>
                      <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:14px;line-height:1.3;font-weight:700;color:#ffffff;">
                        Competitor Radar
                      </p>
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:12px;line-height:1.55;color:#c4c8d4;">
                        Track competitors in real time. See how their ratings and visibility compare to yours.
                      </p>
                    </div>
                  </td>
                </tr>
                <!-- Row 2 -->
                <tr>
                  <td width="50%" valign="top" style="padding:6px;">
                    <div style="background:#2563eb;border-radius:12px;padding:22px 20px;">
                      <p style="margin:0 0 10px 0;line-height:1;">
                        <img src="${ICON_SOCIAL}" width="28" height="28" alt=""
                             style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:28px;max-width:28px;max-height:28px;object-fit:contain;" />
                      </p>
                      <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:14px;line-height:1.3;font-weight:700;color:#ffffff;">
                        Social Studio
                      </p>
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:12px;line-height:1.55;color:#dbeafe;">
                        AI-powered posts aligned with real-time sentiment. Know what to say and when to say it.
                      </p>
                    </div>
                  </td>
                  <td width="50%" valign="top" style="padding:6px;">
                    <div style="background:#eff6ff;border-radius:12px;border:1px solid #dbeafe;padding:22px 20px;">
                      <p style="margin:0 0 10px 0;line-height:1;">
                        <img src="${ICON_CREATOR}" width="28" height="28" alt=""
                             style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:28px;max-width:28px;max-height:28px;object-fit:contain;" />
                      </p>
                      <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:14px;line-height:1.3;font-weight:700;color:#111827;">
                        Creator Hub
                      </p>
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                              font-size:12px;line-height:1.55;color:#4b5563;">
                        Source credible reviews and UGC from local customers. Turn followers into footfall.
                      </p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Bottom CTA block -->
              <div style="border-top:1px solid #e5e7eb;margin:0 0 24px 0;"></div>

              <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:18px;line-height:1.35;font-weight:700;color:#111827;text-align:center;">
                Ready to take control?
              </p>
              <p style="margin:0 0 20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
                Start with the report, then let Antistatic handle the rest. 14-day free trial, no credit card required.
              </p>

              <!-- CTA: centered for all viewports (table + div wrapper for mobile email clients) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px auto;">
                <tr>
                  <td align="center" style="text-align:center;">
                    <div style="text-align:center;">
                      <a href="${reportUrl}"
                         style="display:inline-block;background:#2563eb;color:#ffffff !important;padding:14px 36px;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                        View the full report
                      </a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="text-align:center;padding-top:12px;">
                    <div style="text-align:center;">
                      <a href="https://antistatic.ai"
                         style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                                font-size:13px;font-weight:600;color:#2563eb;text-decoration:underline;">
                        Or visit antistatic.ai to get started
                      </a>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:11px;line-height:1.5;color:#9ca3af;text-align:center;">
                If the button does not work, copy and paste this link:
              </p>
              <p style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:11px;line-height:1.4;color:#9ca3af;text-align:center;word-break:break-all;">
                <a href="${reportUrl}" style="color:#6b7280;text-decoration:underline;">${reportUrl}</a>
              </p>

              <!-- Footer divider -->
              <div style="border-top:1px solid #e5e7eb;margin:0 0 18px 0;"></div>

              <p style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:11px;line-height:1.6;color:#9ca3af;text-align:center;">
                This report was shared via Antistatic. If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `${sharerLabel} shared a business health report with you.

We analysed ${businessRef}'s entire digital footprint and scored it across search visibility, website performance, local listings, and online reputation. The results are ready for you.

View the full report: ${reportUrl}

---

What Antistatic does for your business:

REPUTATION HUB - Request reviews via WhatsApp, email, and SMS. Every review from Google and socials in one feed.

COMPETITOR RADAR - Know what your neighbours are doing. Track competitors in your area in real time. See how their ratings, reviews, and visibility stack up against yours.

SOCIAL STUDIO - Content that actually moves the needle. Create and schedule posts powered by real-time sentiment data. The Studio suggests what to say and when to say it.

CREATOR HUB - Turn foot traffic into five-star content. Source credible reviews and user-generated content from customers in your area. Convert passive followers into real footfall.

---

Ready to take control? Start with the report, then let Antistatic handle the rest. 14-day free trial, no credit card required.

Visit https://antistatic.ai to get started.

This report was shared via Antistatic. If you did not expect this email, you can safely ignore it.`;

  const command = new SendEmailCommand({
    Source: fromWithName,
    Destination: { ToAddresses: [to], BccAddresses: ["hello@antistatic.ai"] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        Text: { Data: textBody, Charset: "UTF-8" },
      },
    },
  });

  // Budget guard: prevent runaway email sends
  apiBudget.spend("ses");

  await ses.send(command);
}
