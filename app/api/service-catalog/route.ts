import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { createTicketWithSla } from "@/lib/services/tickets";

// Service catalog: list items + request (creates a SERVICE_REQUEST ticket, optional approval)
export async function GET() {
  try {
    await requireSession();
    const items = await db.serviceItem.findMany({ orderBy: { category: "asc" } });
    return NextResponse.json({ data: items });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const { serviceItemId, justification } = await req.json();
    const item = await db.serviceItem.findUnique({ where: { id: serviceItemId } });
    if (!item) return NextResponse.json({ error: "Service item not found" }, { status: 404 });
    const ticket = await createTicketWithSla({
      subject: `[Catalog] ${item.name}`,
      description: `${item.description}\n\nJustification: ${justification ?? "—"}`,
      priority: "MEDIUM",
      type: "SERVICE_REQUEST",
      requesterId: user.id,
    });
    try {
      const { notifyTicketCreated } = await import("@/lib/services/notifications");
      await notifyTicketCreated(ticket);
    } catch (e) {
      console.error("[notify catalog]", e);
    }
    if (item.requiresApproval) {
      // route approval to team lead of requester's team or first team lead/admin
      const approver =
        (await db.user.findFirst({ where: { role: "TEAM_LEAD", isActive: true } })) ??
        (await db.user.findFirst({ where: { role: "ADMIN", isActive: true } }));
      if (approver) {
        await db.approvalRequest.create({ data: { ticketId: ticket.id, approverId: approver.id } });
      }
    }
    return NextResponse.json({ data: ticket }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
