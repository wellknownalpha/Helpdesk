import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  leadId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const team = await db.team.update({ where: { id: params.id }, data: parsed.data });
    await db.auditLog.create({ data: { userId: user.id, action: "TEAM_UPDATE", entity: "Team", entityId: team.id, details: parsed.data as never } });
    return NextResponse.json({ data: team });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const members = await db.user.count({ where: { teamId: params.id } });
    if (members > 0) return NextResponse.json({ error: `Cannot delete: ${members} member(s) still assigned` }, { status: 400 });
    await db.team.delete({ where: { id: params.id } });
    await db.auditLog.create({ data: { userId: user.id, action: "TEAM_DELETE", entity: "Team", entityId: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
