import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const article = await db.knowledgeArticle.findUnique({ where: { id: params.id } });
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.knowledgeArticle.update({ where: { id: params.id }, data: { views: { increment: 1 } } });
    return NextResponse.json({ data: article });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (!["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const json = await req.json();
    const article = await db.knowledgeArticle.update({ where: { id: params.id }, data: json });
    return NextResponse.json({ data: article });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await db.knowledgeArticle.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
