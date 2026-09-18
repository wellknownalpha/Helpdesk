import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { commentSchema } from "@/lib/validations";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const ticket = await db.ticket.findUnique({ where: { id: params.id } });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isStaff = ["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role);
    if (user.role === "REQUESTER" && ticket.requesterId !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const json = await req.json();
    const parsed = commentSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.isInternal && !isStaff)
      return NextResponse.json({ error: "Only staff can post internal notes" }, { status: 403 });

    const comment = await db.ticketComment.create({
      data: { ticketId: params.id, authorId: user.id, body: parsed.data.body, isInternal: parsed.data.isInternal },
      include: { author: { select: { id: true, name: true, email: true, role: true } } },
    });
    if (isStaff && !ticket.firstResponseAt && !parsed.data.isInternal) {
      await db.ticket.update({ where: { id: params.id }, data: { firstResponseAt: new Date() } });
    }
    await db.ticket.update({ where: { id: params.id }, data: { updatedAt: new Date() } });
    // Email notification: requester ↔ agent, actor-aware (never breaks the request).
    try {
      const { notifyTicketComment } = await import("@/lib/services/notifications");
      await notifyTicketComment(params.id, user.id, parsed.data.body, parsed.data.isInternal);
    } catch (e) {
      console.error("[notify comment]", e);
    }
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
