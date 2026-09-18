import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { userSchema } from "@/lib/validations";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, teamId: true, departmentId: true, employeeId: true, createdAt: true, team: { select: { name: true } }, department: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ data: users });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const json = await req.json();
    const parsed = userSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { password, ...fields } = parsed.data;
    const existing = await db.user.findUnique({ where: { email: fields.email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    const created = await db.user.create({
      data: {
        ...fields,
        email: fields.email.toLowerCase(),
        passwordHash: await bcrypt.hash(password ?? "Password123!", 10),
      },
    });
    await db.auditLog.create({ data: { userId: user.id, action: "USER_CREATE", entity: "User", entityId: created.id, details: { email: created.email, role: created.role } } });
    const { passwordHash: _ph, ...safe } = created;
    return NextResponse.json({ data: safe }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/users]", e);
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
