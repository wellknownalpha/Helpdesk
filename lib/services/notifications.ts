import { db } from "@/lib/db/prisma";
import { acknowledgementMail, assignedMail, commentMail, sendMail, statusMail } from "@/lib/email/mailer";

// NOTE: server-only module (uses nodemailer + Prisma). UI components must
// import canned responses from "@/lib/canned-responses" instead.
export { cannedResponses } from "@/lib/canned-responses";

type TicketWithPeople = {
  id: string; ticketNumber: number; subject: string; priority: string; status: string;
  requesterId: string;
};

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
 * Notify on a new comment.
 * - Public staff reply  → requester.
 * - Public requester reply → assigned agent (if any).
 * - Internal note → assigned agent (if someone else wrote it).
 * Never emails the author about their own comment.
 */
export async function notifyTicketComment(ticketId: string, authorId: string, body: string, isInternal: boolean): Promise<void> {
  const full = await people(ticketId);
  if (!full) return;
  const authorIsRequester = authorId === full.requester.id;
  const authorIsAssignee = !!full.assignedAgent && authorId === full.assignedAgent.id;

  if (!isInternal) {
    if (!authorIsRequester) {
      await sendMail(commentMail({
        to: full.requester.email, name: full.requester.name,
        ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject,
        authorName: full.assignedAgent && authorId === full.assignedAgent.id ? full.assignedAgent.name : "Support",
        body,
      }));
    } else if (full.assignedAgent && !authorIsAssignee) {
      await sendMail(commentMail({
        to: full.assignedAgent.email, name: full.assignedAgent.name,
        ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject,
        authorName: full.requester.name, body,
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
 * Notify on ticket updates. Actor-aware: the requester isn't emailed about
 * their own close/reopen; the new assignee is always informed of assignment.
 */
export async function notifyTicketUpdated(args: {
  ticketId: string; actorId: string; actorName: string;
  oldStatus?: string; newStatus?: string;
  newAssigneeId?: string | null; assignmentChanged?: boolean;
  changedFields?: string[];
}): Promise<void> {
  const full = await people(args.ticketId);
  if (!full) return;
  const actorIsRequester = args.actorId === full.requester.id;

  if (args.newStatus && args.oldStatus !== args.newStatus && !actorIsRequester) {
    await sendMail(statusMail({
      to: full.requester.email, name: full.requester.name,
      ticketId: full.id, ticketNumber: full.ticketNumber, subject: full.subject,
      oldStatus: args.oldStatus ?? full.status, newStatus: args.newStatus, actorName: args.actorName,
    }));
  } else if (args.newStatus && (args.newStatus === "RESOLVED" || args.newStatus === "CLOSED") && actorIsRequester) {
    // requester closed their own ticket — no email needed
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
