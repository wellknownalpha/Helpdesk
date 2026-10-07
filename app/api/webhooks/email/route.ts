import { NextRequest, NextResponse } from "next/server";
import { simpleParser } from "mailparser";
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
    let htmlBody: string | undefined;
    let messageId: string | undefined;
    let recipientEmails: string[] = [];
    try {
      const json = JSON.parse(body);
      if (json.raw) {
        const parsed = await simpleParser(json.raw);
        from = parsed.from?.value?.[0]?.address ?? from;
        subject = parsed.subject ?? subject;
        messageId = parsed.messageId?.trim() || undefined;
        text = (parsed.text ?? "").trim();
        htmlBody = typeof parsed.html === "string" ? parsed.html : undefined;
        const fields = [parsed.to, parsed.cc, parsed.bcc];
        recipientEmails = fields.flatMap((field) => {
          const addresses = Array.isArray(field) ? field : field?.value ?? [];
          return addresses.flatMap((recipient) => "address" in recipient
            ? recipient.address ? [recipient.address] : []
            : "value" in recipient ? recipient.value.map((value) => value.address).filter((value): value is string => Boolean(value)) : []);
        });
      } else if (json.from || json.subject || json.body) {
        from = json.from ?? from; subject = json.subject ?? subject; text = json.body ?? "";
        recipientEmails = [json.to, json.cc, json.bcc].flatMap((field) => {
          if (typeof field === "string") return field.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
          return Array.isArray(field) ? field.flatMap((value) => typeof value === "string"
            ? value.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []
            : typeof value?.email === "string" ? [value.email] : []) : [];
        });
      }
    } catch {
      const parsed = await simpleParser(body);
      from = parsed.from?.value?.[0]?.address ?? from;
      subject = parsed.subject ?? subject;
      messageId = parsed.messageId?.trim() || undefined;
      text = (parsed.text ?? "").trim();
      htmlBody = typeof parsed.html === "string" ? parsed.html : undefined;
      const fields = [parsed.to, parsed.cc, parsed.bcc];
      recipientEmails = fields.flatMap((field) => {
        const addresses = Array.isArray(field) ? field : field?.value ?? [];
        return addresses.flatMap((recipient) => "address" in recipient
          ? recipient.address ? [recipient.address] : []
          : "value" in recipient ? recipient.value.map((value) => value.address).filter((value): value is string => Boolean(value)) : []);
      });
    }

    const email = from.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? from;
    const result = await processInboundEmail({ fromEmail: email, subject, body: text, htmlBody, recipientEmails, messageId });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    console.error("[webhook/email]", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
