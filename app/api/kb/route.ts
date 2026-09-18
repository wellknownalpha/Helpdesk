import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { kbSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const category = searchParams.get("category");
    const publishedOnly = searchParams.get("published") !== "false";
    const articles = await db.knowledgeArticle.findMany({
      where: {
        ...(publishedOnly ? { isPublished: true } : {}),
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { views: "desc" },
      take: 50,
    });
    return NextResponse.json({ data: articles });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const json = await req.json();
    const parsed = kbSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const article = await db.knowledgeArticle.create({ data: parsed.data });
    return NextResponse.json({ data: article }, { status: 201 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
