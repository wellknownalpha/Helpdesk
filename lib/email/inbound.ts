import { db } from "@/lib/db/prisma";
import { createTicketWithSla } from "@/lib/services/tickets";
import { notifyTicketComment, notifyTicketCreated } from "@/lib/services/notifications";
import { detectPriority } from "./parser";

/** Extracts NX-123 style references so email replies thread onto the same ticket. */
export function extractTicketNumber(subject: string): number | null {
  const m = subject.match(/\[?NX-(\d+)\]?/i);
  return m ? parseInt(m[1], 10) : null;
}

export interface InboundEmail {
  fromEmail: string;
  fromName?: string;
  subject: string;
  body: string;
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
 * - Subject contains [NX-123] → appends a public comment, notifies the agent.
 * - Otherwise → creates a ticket and sends an acknowledgement to the sender.
 */
export async function processInboundEmail(mail: InboundEmail): Promise<
  { action: "created"; ticketId: string; ticketNumber: number } |
  { action: "comment"; ticketId: string; ticketNumber: number }
> {
  const requester = await findOrCreateRequester(mail.fromEmail, mail.fromName);
  const subject = mail.subject?.slice(0, 200) || "(no subject)";
  const body = mail.body?.slice(0, 8000) || "(empty body)";

  const ref = extractTicketNumber(subject);
  if (ref !== null) {
    const ticket = await db.ticket.findUnique({ where: { ticketNumber: ref } });
    if (ticket && ticket.status !== "CLOSED") {
      // Reopen resolved tickets on reply (Freshservice-style threading).
      if (ticket.status === "RESOLVED") {
        await db.ticket.update({ where: { id: ticket.id }, data: { status: "OPEN" } });
      }
      await db.ticketComment.create({
        data: { ticketId: ticket.id, authorId: requester.id, body, isInternal: false },
      });
      await db.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
      await notifyTicketComment(ticket.id, requester.id, body, false);
      console.log(`[inbound] reply from ${requester.email} → NX-${ref} (comment)`);
      return { action: "comment", ticketId: ticket.id, ticketNumber: ref };
    }
  }

  const ticket = await createTicketWithSla({
    subject,
    description: `From: ${requester.email}\n\n${body}`,
    priority: detectPriority(`${subject}\n${body}`),
    type: "INCIDENT",
    requesterId: requester.id,
    source: "EMAIL",
  });
  await notifyTicketCreated(ticket);
  console.log(`[inbound] new ticket NX-${ticket.ticketNumber} from ${requester.email}`);
  return { action: "created", ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
}
