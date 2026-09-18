import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { userSchema } from "@/lib/validations";
import bcrypt from "bcryptjs";

const updateSchema = userSchema.partial().omit({ email: true });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (params.id === user.id) {
      const body = await req.json();
      if (body.role && body.role !== user.role)
        return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
      if (body.isActive === false)
        return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    }
    const json = await req.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { password, ...fields } = parsed.data;
    const updated = await db.user.update({
      where: { id: params.id },
      data: {
        ...fields,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
    });
    await db.auditLog.create({ data: { userId: user.id, action: "USER_UPDATE", entity: "User", entityId: updated.id, details: fields as never } });
    const { passwordHash: _ph, ...safe } = updated;
    return NextResponse.json({ data: safe });
  } catch (e) {
    console.error("[PATCH /api/users/:id]", e);
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
