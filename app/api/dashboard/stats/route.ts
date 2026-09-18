import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";

// GET /api/dashboard/stats — role-scoped aggregates
export async function GET() {
  try {
    const user = await requireSession();
    const scope =
      user.role === "REQUESTER" ? { requesterId: user.id } : user.role === "AGENT" ? { assignedAgentId: user.id } : {};
    const [total, open, pending, resolvedToday, all] = await Promise.all([
      db.ticket.count({ where: scope }),
      db.ticket.count({ where: { ...scope, status: { in: ["NEW", "OPEN", "IN_PROGRESS"] } } }),
      db.ticket.count({ where: { ...scope, status: "PENDING" } }),
      db.ticket.count({ where: { ...scope, resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      db.ticket.findMany({ where: scope, select: { status: true, priority: true, dueDate: true, createdAt: true, firstResponseAt: true } }),
    ]);
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let breached = 0;
    let frTotal = 0;
    let frCount = 0;
    for (const t of all) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
      if (t.dueDate && t.dueDate.getTime() < Date.now() && !["RESOLVED", "CLOSED"].includes(t.status)) breached++;
      if (t.firstResponseAt) {
        frTotal += t.firstResponseAt.getTime() - t.createdAt.getTime();
        frCount++;
      }
    }
    return NextResponse.json({
      data: {
        total, open, pending, resolvedToday, breached,
        avgFirstResponseMins: frCount ? Math.round(frTotal / frCount / 60_000) : null,
        byStatus, byPriority,
      },
    });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
