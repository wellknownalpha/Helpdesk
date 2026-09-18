import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { z } from "zod";

const deptSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().nullable(),
});

export async function GET() {
  try {
    const user = await requireSession();
    if (!["TEAM_LEAD", "ADMIN", "AGENT"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const depts = await db.department.findMany({
      include: { _count: { select: { users: true, tickets: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: depts });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to list departments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = deptSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const dept = await db.department.create({ data: parsed.data });
    await db.auditLog.create({ data: { userId: user.id, action: "DEPT_CREATE", entity: "Department", entityId: dept.id, details: { name: dept.name } } });
    return NextResponse.json({ data: dept }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "A department with this name already exists" }, { status: 409 });
  }
}
