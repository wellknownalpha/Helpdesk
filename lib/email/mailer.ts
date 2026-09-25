import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function notificationsEnabled(): boolean {
  return process.env.NOTIFICATIONS_ENABLED !== "false";
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
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
  return `${base}/tickets/${ticketId}`;
}

export function ticketRef(ticketNumber: number): string {
  return `EXC-${ticketNumber}`;
}

// ---------- templates ----------

export function acknowledgementMail(args: {
  to: string; requesterName: string; ticketId: string; ticketNumber: number; subject: string; priority: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const text = [
    `Hi ${args.requesterName},`,
    ``,
    `Thanks for contacting support. Your request has been logged as ticket ${ref}.`,
    ``,
    `Subject : ${args.subject}`,
    `Priority: ${args.priority}`,
    `Track it: ${ticketLink(args.ticketId)}`,
    ``,
    `Just reply to this email to add updates — your reply will be appended to the same ticket.`,
    ``,
    `— ExclDesk Support`,
  ].join("\n");
  return { to: args.to, subject: `[${ref}] Received: ${args.subject}`, text };
}

export function commentMail(args: {
  to: string; name: string; ticketId: string; ticketNumber: number;
  subject: string; authorName: string; body: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const text = [
    `Hi ${args.name},`,
    ``,
    `${args.authorName} added an update to ticket ${ref} (${args.subject}):`,
    ``,
    args.body,
    ``,
    `View & reply: ${ticketLink(args.ticketId)}`,
    ``,
    `— ExclDesk Support`,
  ].join("\n");
  return { to: args.to, subject: `[${ref}] New update: ${args.subject}`, text };
}

export function statusMail(args: {
  to: string; name: string; ticketId: string; ticketNumber: number;
  subject: string; oldStatus: string; newStatus: string; actorName: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const closed = args.newStatus === "CLOSED" || args.newStatus === "RESOLVED";
  const text = [
    `Hi ${args.name},`,
    ``,
    closed
      ? `Good news — ticket ${ref} (${args.subject}) is now ${args.newStatus.toLowerCase().replace("_", " ")}.`
      : `${args.actorName} moved ticket ${ref} (${args.subject}) from ${args.oldStatus} to ${args.newStatus}.`,
    closed ? `If the issue persists, just reply to reopen it.` : `Track it: ${ticketLink(args.ticketId)}`,
    ``,
    `— ExclDesk Support`,
  ].join("\n");
  return {
    to: args.to,
    subject: closed ? `[${ref}] Resolved: ${args.subject}` : `[${ref}] Status → ${args.newStatus}: ${args.subject}`,
    text,
  };
}

export function assignedMail(args: {
  to: string; agentName: string; ticketId: string; ticketNumber: number; subject: string; priority: string;
}): OutboundMail {
  const ref = ticketRef(args.ticketNumber);
  const text = [
    `Hi ${args.agentName},`,
    ``,
    `Ticket ${ref} has been assigned to you.`,
    ``,
    `Subject : ${args.subject}`,
    `Priority: ${args.priority}`,
    `Open it  : ${ticketLink(args.ticketId)}`,
    ``,
    `— ExclDesk`,
  ].join("\n");
  return { to: args.to, subject: `[${ref}] Assigned to you: ${args.subject}`, text };
}
