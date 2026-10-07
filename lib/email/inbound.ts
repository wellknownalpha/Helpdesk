import { db } from "@/lib/db/prisma";
import { createTicketWithSla } from "@/lib/services/tickets";
import { addTicketEmailParticipants, notifyTicketComment, notifyTicketCreated, notifyTicketUpdated } from "@/lib/services/notifications";
import { detectPriority } from "./parser";

/** Extracts EXC-123 style references so email replies thread onto the same ticket. */
export function extractTicketNumber(subject: string): number | null {
  const m = subject.match(/\[?EXC-(\d+)\]?/i);
  return m ? parseInt(m[1], 10) : null;
}

function normalizeEmailSubject(subject: string): string {
  return subject
    .trim()
    .replace(/^(?:(?:re|fw|fwd):\s*)+/i, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase()
    .slice(0, 200);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export interface InboundEmail {
  fromEmail: string;
  fromName?: string;
  subject: string;
  body: string;
  recipientEmails?: string[];
  messageId?: string;
}

async function findOrCreateRequester(email: string, name?: string) {
  const normalized = email.toLowerCase().trim();
  let user = await db.user.findUnique({ where: { email: normalized } });
  if (!user) {
    user = await db.user.create({
      data: {
        name: name?.trim() || normalized.split("@")[0],
        email: normalized,
        // Inbound-only account: unusable random hash until admin sets a password.
        passwordHash: `!inbound-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "REQUESTER",
      },
    });
  }
  return user;
}

/**
 * Single entry point for ALL email intake (webhook + IMAP poller).
 * - Subject contains [EXC-123] → appends a public comment and notifies participants.
 * - Otherwise → creates a ticket and sends an acknowledgement to the sender.
 */
export async function processInboundEmail(mail: InboundEmail): Promise<
  { action: "created"; ticketId: string; ticketNumber: number } |
  { action: "comment" | "duplicate"; ticketId: string; ticketNumber: number }
> {
  const requester = await findOrCreateRequester(mail.fromEmail, mail.fromName);
  const subject = mail.subject?.slice(0, 200) || "(no subject)";
  const body = mail.body?.slice(0, 8000) || "(empty body)";
  const emailSubjectKey = mail.subject?.trim() ? normalizeEmailSubject(subject) || null : null;

  async function appendEmailComment(ticket: { id: string; ticketNumber: number; status: string }, logContext: string) {
    await addTicketEmailParticipants(ticket.id, [
      { email: requester.email, name: requester.name },
      ...(mail.recipientEmails ?? []).map((email) => ({ email })),
    ]);
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      await db.ticket.update({ where: { id: ticket.id }, data: { status: "OPEN", resolvedAt: null, closedAt: null } });
      await notifyTicketUpdated({
        ticketId: ticket.id,
        actorId: requester.id,
        actorName: requester.name,
        oldStatus: ticket.status,
        newStatus: "OPEN",
      });
    }
    await db.ticketComment.create({
      data: { ticketId: ticket.id, authorId: requester.id, body, isInternal: false, inboundMessageId: mail.messageId },
    });
    await db.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
    await notifyTicketComment(ticket.id, requester.id, body, false, mail.recipientEmails);
    console.log(`[inbound] ${logContext} -> EXC-${ticket.ticketNumber} (comment)`);
    return { action: "comment" as const, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
  }

  if (mail.messageId) {
    const existingTicket = await db.ticket.findUnique({ where: { inboundMessageId: mail.messageId } });
    if (existingTicket) return { action: "duplicate", ticketId: existingTicket.id, ticketNumber: existingTicket.ticketNumber };
    const existingComment = await db.ticketComment.findUnique({
      where: { inboundMessageId: mail.messageId },
      include: { ticket: { select: { id: true, ticketNumber: true } } },
    });
    if (existingComment) return { action: "duplicate", ticketId: existingComment.ticket.id, ticketNumber: existingComment.ticket.ticketNumber };
  }

  const ref = extractTicketNumber(subject);
  if (ref !== null) {
    const ticket = await db.ticket.findUnique({ where: { ticketNumber: ref } });
    if (ticket) {
      return appendEmailComment(ticket, `reply from ${requester.email}`);
    }
  }

  const firstOfSubject = emailSubjectKey
    ? await db.ticket.findUnique({ where: { emailSubjectKey } })
    : null;
  if (firstOfSubject) return appendEmailComment(firstOfSubject, `same-subject email from ${requester.email}`);

  let ticket;
  try {
    ticket = await createTicketWithSla({
      subject,
      description: `From: ${requester.email}\n\n${body}`,
      priority: detectPriority(`${subject}\n${body}`),
      type: "INCIDENT",
      requesterId: requester.id,
      source: "EMAIL",
      inboundMessageId: mail.messageId,
      emailSubjectKey,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    if (mail.messageId) {
      const sameMessageTicket = await db.ticket.findUnique({ where: { inboundMessageId: mail.messageId } });
      if (sameMessageTicket) return { action: "duplicate", ticketId: sameMessageTicket.id, ticketNumber: sameMessageTicket.ticketNumber };
      const sameMessageComment = await db.ticketComment.findUnique({ where: { inboundMessageId: mail.messageId }, include: { ticket: { select: { id: true, ticketNumber: true } } } });
      if (sameMessageComment) return { action: "duplicate", ticketId: sameMessageComment.ticket.id, ticketNumber: sameMessageComment.ticket.ticketNumber };
    }
    const concurrentSubjectTicket = emailSubjectKey
      ? await db.ticket.findUnique({ where: { emailSubjectKey } })
      : null;
    if (!concurrentSubjectTicket) throw error;
    return appendEmailComment(concurrentSubjectTicket, `same-subject email from ${requester.email}`);
  }
  await addTicketEmailParticipants(ticket.id, [
    { email: requester.email, name: requester.name },
    ...(mail.recipientEmails ?? []).map((email) => ({ email })),
  ]);
  await notifyTicketCreated(ticket);
  console.log(`[inbound] new ticket EXC-${ticket.ticketNumber} from ${requester.email}`);
  return { action: "created", ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
}
