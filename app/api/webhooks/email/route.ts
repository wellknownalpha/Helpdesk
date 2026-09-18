import { NextRequest, NextResponse } from "next/server";
import { parseInboundEmail } from "@/lib/email/parser";
import { processInboundEmail } from "@/lib/email/inbound";

/**
 * POST /api/webhooks/email — inbound email → ticket (or threaded comment).
 *
 * Accepts raw RFC822, or JSON { raw } / { from, subject, body }.
 * Used by: SendGrid/Mailgun/AWS SES inbound-parse forwarding, or custom pipes.
 *
 * Security: if INBOUND_WEBHOOK_SECRET is set, requests must carry it as
 * `x-webhook-secret` header. Always set this in production.
 */
export async function POST(req: NextRequest) {
  try {
    const required = process.env.INBOUND_WEBHOOK_SECRET;
    if (required && req.headers.get("x-webhook-secret") !== required) {
      return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
    }

    const body = await req.text();
    let from = "email-user@example.com";
    let subject = "(no subject)";
    let text = body;
    try {
      const json = JSON.parse(body);
      if (json.raw) {
        const parsed = parseInboundEmail(json.raw);
        from = parsed.from; subject = parsed.subject; text = parsed.body;
      } else if (json.from || json.subject || json.body) {
        from = json.from ?? from; subject = json.subject ?? subject; text = json.body ?? "";
      }
    } catch {
      const parsed = parseInboundEmail(body);
      from = parsed.from; subject = parsed.subject; text = parsed.body;
    }

    const email = from.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? from;
    const result = await processInboundEmail({ fromEmail: email, subject, body: text });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    console.error("[webhook/email]", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
