/**
 * Send "Your report is ready" email with link to view the report in browser.
 * From: hello@antistatic.ai
 * Uses same logo and layout style as OTP email. No em dashes in subject or body.
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { apiBudget } from "@/lib/net/apiBudget";

const FROM_EMAIL = process.env.REPORT_EMAIL_FROM || "hello@antistatic.ai";
const LOGO_URL =
  "https://bmkdwnfrldoqvduhpgsu.supabase.co/storage/v1/object/public/Storage/antistatic-logo-on-white%20(1).png";

export interface SendReportReadyEmailParams {
  to: string;
  reportUrl: string;
  businessName: string | null;
}

export async function sendReportReadyEmail({
  to,
  reportUrl,
  businessName,
}: SendReportReadyEmailParams): Promise<void> {
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
  const subject = "Your Antistatic report is ready to view";

  const introLine = businessName
    ? `Your online presence report for ${businessName} is ready.`
    : "Your online presence report is ready.";

  const htmlBody = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your report is ready</title>
  <style>
    @media (prefers-color-scheme: dark) {
      body, .bg { background:#0b0f19 !important; }
      .card { background:#111827 !important; border-color:#1f2937 !important; }
      .text { color:#f9fafb !important; }
      .muted { color:#9ca3af !important; }
      .rule { border-top-color:#1f2937 !important; }
      .link { color:#93c5fd !important; }
    }
  </style>
</head>

<body style="margin:0;padding:0;background:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Your Antistatic report is ready. Open it in your browser: ${reportUrl}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               class="card"
               style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
          <tr>
            <td align="center" style="padding:34px 34px 26px 34px;">
              <div style="text-align:center;margin-bottom:18px;">
                <img src="${LOGO_URL}"
                     width="200" height="33" alt="Antistatic"
                     style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:200px;height:33px;object-fit:contain;" />
              </div>

              <h1 class="text"
                  style="margin:0 0 22px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                         font-size:24px;line-height:1.3;font-weight:600;color:#111827;text-align:center;">
                Your report is ready
              </h1>

              <p class="text"
                 style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:14px;line-height:1.6;color:#111827;text-align:center;">
                ${introLine} Open it in your browser to see your scores, insights, and next steps.
              </p>

              <p style="margin:0 0 24px 0;text-align:center;">
                <a href="${reportUrl}" class="link"
                   style="display:inline-block;background:#2563eb;color:#ffffff !important;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                  View your report
                </a>
              </p>

              <p class="muted"
                 style="margin:0 0 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p class="muted"
                 style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:12px;line-height:1.5;color:#6b7280;text-align:center;word-break:break-all;">
                <a href="${reportUrl}" class="link" style="color:#2563eb;text-decoration:underline;">${reportUrl}</a>
              </p>

              <div class="rule" style="border-top:1px solid #e5e7eb;margin:28px 0 18px 0;"></div>

              <p class="muted"
                 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
                        font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
                You received this email because you requested an online presence report at antistatic.ai.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Your report is ready.\n\n${introLine} Open it in your browser to see your scores, insights, and next steps.\n\nView your report: ${reportUrl}\n\nYou received this email because you requested an online presence report at antistatic.ai.`;

  const command = new SendEmailCommand({
    Source: fromWithName,
    Destination: { ToAddresses: [to] },
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
