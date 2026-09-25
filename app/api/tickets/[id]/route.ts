import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { updateTicketSchema, commentSchema } from "@/lib/validations";
import { canViewTicket } from "@/lib/auth/rbac";
import { computeDueDate, resolveSlaPolicy } from "@/lib/services/sla";

async function loadTicket(id: string) {
  return db.ticket.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      assignedAgent: { select: { id: true, name: true, email: true } },
      assignedTeam: true,
      department: true,
      slaPolicy: true,
      comments: { include: { author: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: "asc" } },
      history: { orderBy: { createdAt: "desc" }, take: 50 },
      attachments: true,
      tags: { include: { tag: true } },
      approvals: true,
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const ticket = await loadTicket(params.id);
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canViewTicket({ id: user.id, role: user.role, teamId: user.teamId }, ticket)) {
      // requesters may still view own; agents scoped
      if (user.role === "REQUESTER" && ticket.requesterId !== user.id)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Hide internal notes from requesters
    if (user.role === "REQUESTER") {
      return NextResponse.json({ data: { ...ticket, comments: ticket.comments.filter((c) => !c.isInternal) } });
    }
    return NextResponse.json({ data: ticket });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to load ticket" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const ticket = await db.ticket.findUnique({ where: { id: params.id } });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = ticket.requesterId === user.id;
    const isStaff = user.role === "AGENT" || user.role === "TEAM_LEAD" || user.role === "ADMIN";
    if (!isStaff && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const json = await req.json();
    // Requesters may only close/reopen own tickets
    if (!isStaff) {
      const allowed = json.status === "CLOSED" || json.status === "OPEN" || json.status === "NEW";
      if (!allowed || Object.keys(json).some((k) => !["status"].includes(k)))
        return NextResponse.json({ error: "Requesters can only close/reopen their tickets" }, { status: 403 });
    }

    const parsed = updateTicketSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const data: Record<string, unknown> = { ...parsed.data };
    // Track history + timestamps
    const historyWrites: { actorId: string; field: string; oldValue?: string | null; newValue?: string | null }[] = [];
    for (const [field, newVal] of Object.entries(parsed.data)) {
      const oldVal = (ticket as unknown as Record<string, unknown>)[field];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        historyWrites.push({ actorId: user.id, field, oldValue: String(oldVal ?? ""), newValue: String(newVal ?? "") });
      }
    }
    if (parsed.data.status === "RESOLVED") data.resolvedAt = new Date();
    if (parsed.data.status === "CLOSED") data.closedAt = new Date();
    if (parsed.data.status === "OPEN" || parsed.data.status === "NEW") {
      data.resolvedAt = null;
      data.closedAt = null;
    }
    if (parsed.data.priority && parsed.data.priority !== ticket.priority) {
      const sla = await resolveSlaPolicy(parsed.data.priority as never);
      if (sla) { (data as Record<string, unknown>).slaPolicyId = sla.id; data.dueDate = computeDueDate(new Date(), sla.resolutionMins); }
    }
    // first response tracking
    if (isStaff && !ticket.firstResponseAt) data.firstResponseAt = new Date();

    const updated = await db.ticket.update({
      where: { id: params.id },
      data: {
        ...(data as Record<string, unknown>),
        history: historyWrites.length ? { create: historyWrites } : undefined,
      } as never,
    });
    await db.auditLog.create({
      data: { userId: user.id, action: "TICKET_UPDATE", entity: "Ticket", entityId: updated.id, details: parsed.data as never },
    });
    // Email notifications: status changes (incl. resolve/close), assignment, notable edits.
    try {
      const { notifyTicketUpdated } = await import("@/lib/services/notifications");
      const newAgent = parsed.data.assignedAgentId;
      await notifyTicketUpdated({
        ticketId: updated.id,
        actorId: user.id,
        actorName: user.name ?? "Support",
        oldStatus: ticket.status,
        newStatus: parsed.data.status,
        newAssigneeId: typeof newAgent === "string" ? newAgent : null,
        assignmentChanged: newAgent !== undefined && newAgent !== ticket.assignedAgentId,
        changedFields: Object.keys(parsed.data),
      });
    } catch (e) {
      console.error("[notify update]", e);
    }
    return NextResponse.json({ data: await loadTicket(updated.id) });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await db.ticket.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
