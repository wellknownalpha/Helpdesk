import { db } from "@/lib/db/prisma";
import { computeDueDate, resolveSlaPolicy } from "@/lib/services/sla";
import type { Prisma, TicketPriority } from "@prisma/client";

export async function createTicketWithSla(data: {
  subject: string;
  description: string;
  priority: TicketPriority;
  type: "INCIDENT" | "SERVICE_REQUEST" | "PROBLEM" | "CHANGE_REQUEST" | "QUESTION";
  requesterId: string;
  departmentId?: string | null;
  assignedTeamId?: string | null;
  source?: "PORTAL" | "EMAIL" | "PHONE" | "CHAT" | "API";
  tags?: string[];
}) {
  const sla = await resolveSlaPolicy(data.priority);
  const now = new Date();
  const ticket = await db.ticket.create({
    data: {
      subject: data.subject,
      description: data.description,
      priority: data.priority,
      type: data.type,
      requesterId: data.requesterId,
      departmentId: data.departmentId ?? undefined,
      assignedTeamId: data.assignedTeamId ?? undefined,
      source: data.source ?? "PORTAL",
      slaPolicyId: sla?.id,
      dueDate: sla ? computeDueDate(now, sla.resolutionMins) : undefined,
      history: { create: [{ actorId: data.requesterId, field: "created", newValue: data.subject }] },
    },
    include: { requester: true },
  });
  if (data.tags?.length) {
    for (const name of data.tags) {
      const tag = await db.tag.upsert({ where: { name }, update: {}, create: { name } });
      await db.tagOnTicket.create({ data: { ticketId: ticket.id, tagId: tag.id } }).catch(() => {});
    }
  }
  await db.auditLog.create({
    data: { userId: data.requesterId, action: "TICKET_CREATE", entity: "Ticket", entityId: ticket.id, details: { subject: data.subject } },
  });
  return ticket;
}

export async function applyAutomationRules(ticketId: string): Promise<string[]> {
  // Simple rule engine: urgent → assign Infra team; "password" → L1 team; question → LOW.
  const applied: string[] = [];
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return applied;
  const updates: Prisma.TicketUpdateInput = {};
  if (ticket.priority === "URGENT" && !ticket.assignedTeamId) {
    const infra = await db.team.findUnique({ where: { name: "Infrastructure" } });
    if (infra) { updates.assignedTeam = { connect: { id: infra.id } }; applied.push("auto-assign-infra-urgent"); }
  }
  if (/password|vpn|printer/i.test(ticket.subject) && !ticket.assignedTeamId) {
    const l1 = await db.team.findUnique({ where: { name: "L1 Support" } });
    if (l1) { updates.assignedTeam = { connect: { id: l1.id } }; applied.push("auto-assign-l1-keyword"); }
  }
  if (Object.keys(updates).length) await db.ticket.update({ where: { id: ticketId }, data: updates });
  return applied;
}
