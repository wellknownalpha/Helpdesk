import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

// GET /api/attachments/:id — download (requester sees own, staff see scoped)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const attachment = await db.attachment.findUnique({ where: { id: params.id }, include: { ticket: true } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isStaff = ["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role);
    if (!isStaff && attachment.ticket.requesterId !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const data = await readFile(path.join(UPLOAD_DIR, attachment.fileUrl));
    return new NextResponse(data, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, "")}"`,
      },
    });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}

// DELETE /api/attachments/:id — staff only
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    if (!["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const attachment = await db.attachment.findUnique({ where: { id: params.id } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.attachment.delete({ where: { id: params.id } });
    await unlink(path.join(UPLOAD_DIR, attachment.fileUrl)).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
