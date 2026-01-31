/**
 * Send app sign-in / set-password email via AWS SES
 * From: hello@antistatic.ai (use env APP_INVITE_FROM_EMAIL or SES_FROM_EMAIL)
 * Server-side only.
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const FROM_EMAIL =
  process.env.APP_INVITE_FROM_EMAIL ||
  process.env.SES_FROM_EMAIL_PASS ||
  process.env.SES_FROM_EMAIL ||
  "hello@antistatic.ai";

export interface SendAppInviteEmailParams {
  to: string;
  signInLink: string;
}

/**
 * Send "Finish setting up your Antistatic account" email with sign-in link
 */
export async function sendAppInviteEmail({ to, signInLink }: SendAppInviteEmailParams): Promise<void> {
  const region = process.env.AWS_REGION || "us-east-1";
  const ses = new SESClient({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  const fromAddress = FROM_EMAIL;
  const fromWithName = `Antistatic <${fromAddress}>`;
  const subject = "Finish setting up your Antistatic account";

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Finish setting up your Antistatic account</h2>
      <p>Click the button below to sign in and set your password. This link is one-time use.</p>
      <p style="margin: 28px 0;">
        <a href="${signInLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">Sign in & set password</a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="color: #6b7280; font-size: 12px; word-break: break-all;">${signInLink}</p>
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;

  const textBody = `Finish setting up your Antistatic account\n\nSign in and set your password: ${signInLink}\n\nThis link is one-time use. If you didn't request this, you can ignore this email.`;

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

  await ses.send(command);
}
