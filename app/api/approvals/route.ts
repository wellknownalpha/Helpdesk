import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";

export async function GET() {
  try {
    const user = await requireSession();
    const where =
      user.role === "ADMIN" || user.role === "TEAM_LEAD"
        ? {}
        : { approverId: user.id };
    // requesters see approvals for their tickets
    const mine =
      user.role === "REQUESTER"
        ? await db.approvalRequest.findMany({ where: { ticket: { requesterId: user.id } }, include: { ticket: true } })
        : await db.approvalRequest.findMany({ where: where as never, include: { ticket: true }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ data: mine });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!["TEAM_LEAD", "ADMIN"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id, status, comments } = await req.json();
    if (!["APPROVED", "REJECTED", "CANCELLED"].includes(status))
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const approval = await db.approvalRequest.update({ where: { id }, data: { status, comments } });
    await db.ticketHistory.create({
      data: { ticketId: approval.ticketId, actorId: user.id, field: "approval", newValue: status },
    });
    return NextResponse.json({ data: approval });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
