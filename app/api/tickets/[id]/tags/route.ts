import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { z } from "zod";

const tagSchema = z.object({ name: z.string().min(1).max(40).transform((s) => s.toLowerCase().trim()) });

// POST /api/tickets/:id/tags { name } — attach (upsert) a tag
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const ticket = await db.ticket.findUnique({ where: { id: params.id } });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isStaff = ["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role);
    if (!isStaff && ticket.requesterId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = tagSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid tag name" }, { status: 400 });
    const tag = await db.tag.upsert({ where: { name: parsed.data.name }, update: {}, create: { name: parsed.data.name } });
    await db.tagOnTicket.upsert({
      where: { ticketId_tagId: { ticketId: params.id, tagId: tag.id } },
      update: {},
      create: { ticketId: params.id, tagId: tag.id },
    });
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }
}

// DELETE /api/tickets/:id/tags?tagId= — remove a tag (staff only)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (!["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const tagId = new URL(req.url).searchParams.get("tagId");
    if (!tagId) return NextResponse.json({ error: "tagId required" }, { status: 400 });
    await db.tagOnTicket.delete({ where: { ticketId_tagId: { ticketId: params.id, tagId } } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }
}
