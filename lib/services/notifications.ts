import { db } from "@/lib/db/prisma";
import { acknowledgementMail, assignedMail, commentMail, sendMail, statusMail } from "@/lib/email/mailer";

// NOTE: server-only module (uses nodemailer + Prisma). UI components must
// import canned responses from "@/lib/canned-responses" instead.
export { cannedResponses } from "@/lib/canned-responses";

type TicketWithPeople = {
  id: string; ticketNumber: number; subject: string; priority: string; status: string;
  requesterId: string;
};

type EmailParticipant = { email: string; name?: string | null };

function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export async function addTicketEmailParticipants(ticketId: string, participants: EmailParticipant[]): Promise<void> {
  const unique = new Map<string, string | null>();
  for (const participant of participants) {
    const email = normalizeEmail(participant.email);
    if (email) unique.set(email, participant.name?.trim() || null);
  }
  if (!unique.size) return;
  await db.ticketEmailParticipant.createMany({
    data: Array.from(unique, ([email, name]) => ({ ticketId, email, name })),
    skipDuplicates: true,
  });
}

async function ticketEmailRecipients(ticket: NonNullable<Awaited<ReturnType<typeof people>>>, extra: EmailParticipant[] = []) {
  const participants = await db.ticketEmailParticipant.findMany({
    where: { ticketId: ticket.id },
    select: { email: true, name: true },
  });
  const recipients = new Map<string, string>();
  const supportMailbox = normalizeEmail(process.env.SUPPORT_MAILBOX ?? process.env.IMAP_USER ?? "");
  const all = [
    { email: ticket.requester.email, name: ticket.requester.name },
    ...(ticket.assignedAgent ? [{ email: ticket.assignedAgent.email, name: ticket.assignedAgent.name }] : []),
    ...participants,
    ...extra,
  ];
  for (const participant of all) {
    const email = normalizeEmail(participant.email);
    if (email && email !== supportMailbox && !recipients.has(email)) {
      recipients.set(email, participant.name?.trim() || email);
    }
  }
  return recipients;
}

async function people(ticketId: string) {
  const t = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      assignedAgent: { select: { id: true, name: true, email: true } },
    },
  });
  return t;
}

/** Acknowledgement to the requester on ticket creation (email/portal/catalog/API). */
export async function notifyTicketCreated(ticket: TicketWithPeople): Promise<void> {
  const full = await people(ticket.id);
  if (!full) return;
  await sendMail(acknowledgementMail({
    to: full.requester.email,
    requesterName: full.requester.name,
    ticketId: full.id,
    ticketNumber: full.ticketNumber,
    subject: full.subject,
    priority: full.priority,
  }));
}

/**
 * Notify every ticket email participant of public comments. Internal notes
 * remain staff-only and are not sent to external email participants.
 */
export async function notifyTicketComment(
  ticketId: string,
  authorId: string,
  body: string,
  isInternal: boolean,
  recipientEmails: string[] = [],
): Promise<void> {
  const full = await people(ticketId);
  if (!full) return;
  const author = await db.user.findUnique({ where: { id: authorId }, select: { name: true, email: true } });
  if (!author) return;
  const authorIsAssignee = !!full.assignedAgent && authorId === full.assignedAgent.id;

  if (!isInternal) {
    await addTicketEmailParticipants(ticketId, [
      { email: author.email, name: author.name },
      ...recipientEmails.map((email) => ({ email })),
    ]);
    const recipients = await ticketEmailRecipients(full);
    for (const [email, name] of recipients) {
      await sendMail(commentMail({
        to: email, name,
        ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject,
        authorName: author.name, body,
      }));
    }
  } else if (full.assignedAgent && !authorIsAssignee) {
    await sendMail(commentMail({
      to: full.assignedAgent.email, name: full.assignedAgent.name,
      ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject,
      authorName: "A teammate", body: `(Internal note) ${body}`,
    }));
  }
}

/**
 * Notify all ticket email participants when status changes, while preserving
 * assignment and notable-field notifications.
 */
export async function notifyTicketUpdated(args: {
  ticketId: string; actorId: string; actorName: string;
  oldStatus?: string; newStatus?: string;
  newAssigneeId?: string | null; assignmentChanged?: boolean;
  changedFields?: string[];
}): Promise<void> {
  const full = await people(args.ticketId);
  if (!full) return;
  const actor = await db.user.findUnique({ where: { id: args.actorId }, select: { name: true, email: true } });
  const actorIsRequester = args.actorId === full.requester.id;

  if (args.newStatus && args.oldStatus !== args.newStatus) {
    await addTicketEmailParticipants(args.ticketId, actor ? [{ email: actor.email, name: actor.name }] : []);
    const recipients = await ticketEmailRecipients(full);
    for (const [email, name] of recipients) {
      await sendMail(statusMail({
        to: email, name,
        ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject,
        oldStatus: args.oldStatus ?? full.status, newStatus: args.newStatus, actorName: args.actorName,
      }));
    }
  }

  if (args.assignmentChanged && args.newAssigneeId && args.newAssigneeId !== args.actorId) {
    const assignee = await db.user.findUnique({ where: { id: args.newAssigneeId }, select: { email: true, name: true } });
    if (assignee) {
      await sendMail(assignedMail({
        to: assignee.email, agentName: assignee.name,
        ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject, priority: full.priority,
      }));
    }
  }

  // Other staff-driven field changes (priority/type/team) → short note to requester
  const notable = (args.changedFields ?? []).filter((f) => ["priority", "type", "assignedTeamId"].includes(f));
  if (notable.length && !actorIsRequester && !args.newStatus) {
    await sendMail(commentMail({
      to: full.requester.email, name: full.requester.name,
      ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject,
      authorName: args.actorName, body: `Updated ${notable.join(", ")} on your ticket.`,
    }));
  }
}
