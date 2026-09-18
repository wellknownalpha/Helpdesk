import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";

// POST /api/tickets/:id/merge { targetTicketId } — staff only
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (!["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { targetTicketId } = await req.json();
    if (!targetTicketId || targetTicketId === params.id)
      return NextResponse.json({ error: "Invalid target ticket" }, { status: 400 });
    const [source, target] = await Promise.all([
      db.ticket.findUnique({ where: { id: params.id }, include: { comments: true } }),
      db.ticket.findUnique({ where: { id: targetTicketId } }),
    ]);
    if (!source || !target) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    // Move comments
    await db.ticketComment.updateMany({ where: { ticketId: source.id }, data: { ticketId: target.id } });
    await db.ticketHistory.create({
      data: { ticketId: target.id, actorId: user.id, field: "merged", oldValue: `#${source.ticketNumber}`, newValue: `#${target.ticketNumber}` },
    });
    await db.ticket.update({ where: { id: source.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await db.auditLog.create({ data: { userId: user.id, action: "TICKET_MERGE", entity: "Ticket", entityId: target.id, details: { sourceId: source.id } } });
    return NextResponse.json({ ok: true, mergedInto: target.id });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Merge failed" }, { status: 500 });
  }
}
