import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { slaSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireSession();
    const policies = await db.slaPolicy.findMany({ orderBy: { resolutionMins: "asc" } });
    return NextResponse.json({ data: policies });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const json = await req.json();
    const parsed = slaSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const policy = await db.slaPolicy.create({ data: parsed.data });
    return NextResponse.json({ data: policy }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
