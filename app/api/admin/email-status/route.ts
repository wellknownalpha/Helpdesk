import { NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { notificationsEnabled, smtpConfigured } from "@/lib/email/mailer";

// GET /api/admin/email-status — safe config overview (never exposes secrets).
export async function GET() {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({
      data: {
        notificationsEnabled: notificationsEnabled(),
        smtp: {
          configured: smtpConfigured(),
          host: process.env.SMTP_HOST ?? null,
          port: Number(process.env.SMTP_PORT ?? 1025),
          from: process.env.SMTP_FROM ?? null,
          hasCredentials: Boolean(process.env.SMTP_USER),
        },
        supportMailbox: process.env.SUPPORT_MAILBOX ?? null,
        webhookSecretSet: Boolean(process.env.INBOUND_WEBHOOK_SECRET),
        inboundPoller: {
          enabled: process.env.MAIL_INBOUND_ENABLED === "true",
          host: process.env.IMAP_HOST ?? null,
          mailbox: process.env.IMAP_MAILBOX ?? "INBOX",
          pollSeconds: Number(process.env.IMAP_POLL_SECONDS ?? 60),
        },
      },
    });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
