import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { z } from "zod";

const teamSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().nullable(),
  leadId: z.string().nullable().optional(),
});

export async function GET() {
  try {
    const user = await requireSession();
    if (!["TEAM_LEAD", "ADMIN", "AGENT"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const teams = await db.team.findMany({
      include: {
        _count: { select: { members: true, tickets: true } },
        members: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: teams });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to list teams" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = teamSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const team = await db.team.create({ data: parsed.data });
    await db.auditLog.create({ data: { userId: user.id, action: "TEAM_CREATE", entity: "Team", entityId: team.id, details: { name: team.name } } });
    return NextResponse.json({ data: team }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
  }
}
