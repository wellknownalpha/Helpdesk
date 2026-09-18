import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const dept = await db.department.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json({ data: dept });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to update department" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const users = await db.user.count({ where: { departmentId: params.id } });
    if (users > 0) return NextResponse.json({ error: `Cannot delete: ${users} user(s) still assigned` }, { status: 400 });
    await db.department.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to delete department" }, { status: 500 });
  }
}
