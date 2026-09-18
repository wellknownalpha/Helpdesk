import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { createTicketSchema } from "@/lib/validations";
import { createTicketWithSla, applyAutomationRules } from "@/lib/services/tickets";
import { canViewTicket } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const type = searchParams.get("type");
    const q = searchParams.get("q");
    const mine = searchParams.get("mine");
    const teamId = searchParams.get("teamId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (teamId) where.assignedTeamId = teamId;
    if (q) where.OR = [{ subject: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];

    // RBAC scoping
    if (user.role === "REQUESTER") {
      where.requesterId = user.id;
    } else if (user.role === "AGENT") {
      if (mine === "true") where.assignedAgentId = user.id;
      else if (!q && !status) {
        // default agent view: assigned to me, my team, or unassigned
        where.OR = [
          { assignedAgentId: user.id },
          ...(user.teamId ? [{ assignedTeamId: user.teamId }] : []),
          { assignedAgentId: null },
          { requesterId: user.id },
        ];
      }
    }
    // TEAM_LEAD + ADMIN see all (optionally filtered)

    const [total, tickets] = await Promise.all([
      db.ticket.count({ where: where as never }),
      db.ticket.findMany({
        where: where as never,
        include: {
          requester: { select: { id: true, name: true, email: true } },
          assignedAgent: { select: { id: true, name: true } },
          assignedTeam: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const filtered =
      user.role === "AGENT"
        ? tickets.filter((t) => canViewTicket({ id: user.id, role: user.role, teamId: user.teamId }, t))
        : tickets;

    return NextResponse.json({ data: filtered, total, page, pageSize });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to list tickets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const json = await req.json();
    const parsed = createTicketSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const ticket = await createTicketWithSla({
      ...parsed.data,
      type: parsed.data.type as never,
      priority: parsed.data.priority as never,
      requesterId: user.id,
      tags: parsed.data.tags ?? [],
    });
    await applyAutomationRules(ticket.id);
    // Acknowledgement email to the requester (never breaks ticket creation).
    try {
      const { notifyTicketCreated } = await import("@/lib/services/notifications");
      await notifyTicketCreated(ticket);
    } catch (e) {
      console.error("[notify create]", e);
    }
    const full = await db.ticket.findUnique({
      where: { id: ticket.id },
      include: { requester: { select: { id: true, name: true, email: true } }, assignedTeam: true },
    });
    return NextResponse.json({ data: full }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
