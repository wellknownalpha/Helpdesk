import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function notificationsEnabled(): boolean {
  return process.env.NOTIFICATIONS_ENABLED !== "false";
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function isBlockedRecipient(email: string): boolean {
  return new Set(
    (process.env.EMAIL_RECIPIENTS_BLOCKLIST ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  ).has(email.trim().toLowerCase());
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER || process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "" }
          : undefined,
    });
  }
  return transporter;
}

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Non-blocking-safe send: logs and swallows errors so ticket flows never break. */
export async function sendMail(mail: OutboundMail): Promise<boolean> {
  if (isBlockedRecipient(mail.to)) {
    console.log(`[mail:skipped-blocked-recipient] to=${mail.to} subject=${mail.subject}`);
    return false;
  }
  if (!notificationsEnabled()) {
    console.log(`[mail:skipped-disabled] to=${mail.to} subject=${mail.subject}`);
    return false;
  }
  if (!smtpConfigured()) {
    console.log(`[mail:skipped-no-smtp] to=${mail.to} subject=${mail.subject}`);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? "ExclDesk <support@excldesk.local>",
      replyTo: process.env.SUPPORT_MAILBOX || undefined,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html ?? `<pre>${escapeHtml(mail.text)}</pre>`,
    });
    console.log(`[mail:sent] to=${mail.to} subject=${mail.subject}`);
    return true;
  } catch (e) {
    console.error(`[mail:failed] to=${mail.to}`, e);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ticketLink(ticketId: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
  return new URL(`/tickets/${ticketId}`, base).toString();
}

function buildHtmlEmail(args: {
  title: string;
  heading: string;
  bodyLines: string[];
  actionLabel: string;
  ticketUrl: string;
}): string {
  const safeTitle = escapeHtml(args.title);
  const safeHeading = escapeHtml(args.heading);
  const safeUrl = escapeHtml(args.ticketUrl);
  const lines = args.bodyLines.map((line) => `<p style="margin:0 0 12px; font-size:15px; line-height:1.6; color:#1f2937;">${escapeHtml(line)}</p>`).join("");

  return `<!doctype html>
<html>
  <body style="margin:0; padding:32px 16px; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#111827;">
    <div style="max-width:620px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:32px;">
      <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#6b7280; font-weight:bold; margin-bottom:16px;">${safeTitle}</div>
      <h2 style="margin:0 0 16px; font-size:24px; line-height:1.3; color:#111827; font-family:Arial,Helvetica,sans-serif;">${safeHeading}</h2>
      ${lines}
      <p style="margin:20px 0 12px;">
        <a href="${safeUrl}" style="display:inline-block; background:#0f172a; color:#ffffff; text-decoration:none; font-weight:600; padding:12px 18px; border-radius:8px; font-family:Arial,Helvetica,sans-serif;">${escapeHtml(args.actionLabel)}</a>
      </p>
      <p style="margin:0; font-size:13px; line-height:1.7; color:#4b5563; word-break:break-all;">
        Or open: <a href="${safeUrl}" style="color:#2563eb; text-decoration:underline;">${safeUrl}</a>
      </p>
    </div>
  </body>
</html>`;
}

export function ticketRef(ticketNumber: number): string {
  return `EXC-${ticketNumber}`;
}

// ---------- templates ----------

export function acknowledgementMail(args: {
  to: string; requesterName: string; ticketId: string; ticketNumber: number; subject: string; priority: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const ticketUrl = ticketLink(args.ticketId);
  const text = [
    `Hi ${args.requesterName},`,
    ``,
    `Thanks for contacting support. Your request has been logged as ticket ${ref}.`,
    ``,
    `Subject : ${args.subject}`,
    `Priority: ${args.priority}`,
    `Track it: ${ticketUrl}`,
    ``,
    `Just reply to this email to add updates — your reply will be appended to the same ticket.`,
    ``,
    `— ExclDesk Support`,
  ].join("\n");

  return {
    to: args.to,
    subject: `[${ref}] Received: ${args.subject}`,
    text,
    html: buildHtmlEmail({
      title: "ExclDesk Support",
      heading: `Ticket ${ref} received`,
      bodyLines: [
        `Hi ${args.requesterName},`,
        `Thanks for contacting support. Your request has been logged as ticket ${ref}.`,
        `Subject: ${args.subject}`,
        `Priority: ${args.priority}`,
        "Just reply to this email to add updates — your reply will be appended to the same ticket.",
      ],
      actionLabel: "Open ticket",
      ticketUrl,
    }),
  };
}

export function commentMail(args: {
  to: string; name: string; ticketId: string; ticketNumber: number;
  subject: string; authorName: string; body: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const ticketUrl = ticketLink(args.ticketId);
  const text = [
    `Hi ${args.name},`,
    ``,
    `${args.authorName} added an update to ticket ${ref} (${args.subject}):`,
    ``,
    args.body,
    ``,
    `View & reply: ${ticketUrl}`,
    ``,
    `— ExclDesk Support`,
  ].join("\n");
  return {
    to: args.to,
    subject: `[${ref}] New update: ${args.subject}`,
    text,
    html: buildHtmlEmail({
      title: "Ticket update",
      heading: `${args.authorName} added an update`,
      bodyLines: [
        `Hi ${args.name},`,
        `${args.authorName} added an update to ticket ${ref} (${args.subject}):`,
        args.body,
      ],
      actionLabel: "View ticket",
      ticketUrl,
    }),
  };
}

export function statusMail(args: {
  to: string; name: string; ticketId: string; ticketNumber: number;
  subject: string; oldStatus: string; newStatus: string; actorName: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const ticketUrl = ticketLink(args.ticketId);
  const closed = args.newStatus === "CLOSED" || args.newStatus === "RESOLVED";
  const text = [
    `Hi ${args.name},`,
    ``,
    closed
      ? `Good news — ticket ${ref} (${args.subject}) is now ${args.newStatus.toLowerCase().replace("_", " ")}.`
      : `${args.actorName} moved ticket ${ref} (${args.subject}) from ${args.oldStatus} to ${args.newStatus}.`,
    closed ? `If the issue persists, just reply to reopen it.` : `Track it: ${ticketUrl}`,
    ``,
    `— ExclDesk Support`,
  ].join("\n");
  return {
    to: args.to,
    subject: closed ? `[${ref}] Resolved: ${args.subject}` : `[${ref}] Status → ${args.newStatus}: ${args.subject}`,
    text,
    html: buildHtmlEmail({
      title: "Ticket status",
      heading: closed ? `Ticket ${ref} is now ${args.newStatus.toLowerCase().replace("_", " ")}` : `Ticket ${ref} status updated`,
      bodyLines: [
        `Hi ${args.name},`,
        closed
          ? `Good news — ticket ${ref} (${args.subject}) is now ${args.newStatus.toLowerCase().replace("_", " ")}.`
          : `${args.actorName} moved ticket ${ref} (${args.subject}) from ${args.oldStatus} to ${args.newStatus}.`,
        closed ? "If the issue persists, just reply to reopen it." : "Track it in the ticket portal.",
      ],
      actionLabel: "Open ticket",
      ticketUrl,
    }),
  };
}

export function assignedMail(args: {
  to: string; agentName: string; ticketId: string; ticketNumber: number; subject: string; priority: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const ticketUrl = ticketLink(args.ticketId);
  const text = [
    `Hi ${args.agentName},`,
    ``,
    `Ticket ${ref} has been assigned to you.`,
    ``,
    `Subject : ${args.subject}`,
    `Priority: ${args.priority}`,
    `Open it  : ${ticketUrl}`,
    ``,
    `— ExclDesk`,
  ].join("\n");
  return {
    to: args.to,
    subject: `[${ref}] Assigned to you: ${args.subject}`,
    text,
    html: buildHtmlEmail({
      title: "New assignment",
      heading: `Ticket ${ref} assigned to you`,
      bodyLines: [
        `Hi ${args.agentName},`,
        `Ticket ${ref} has been assigned to you.`,
        `Subject: ${args.subject}`,
        `Priority: ${args.priority}`,
      ],
      actionLabel: "Open ticket",
      ticketUrl,
    }),
  };
}
