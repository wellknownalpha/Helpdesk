import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

// POST /api/tickets/:id/attachments — multipart form { file }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const ticket = await db.ticket.findUnique({ where: { id: params.id } });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isStaff = ["AGENT", "TEAM_LEAD", "ADMIN"].includes(user.role);
    if (!isStaff && ticket.requesterId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });

    await mkdir(UPLOAD_DIR, { recursive: true });
    const stored = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName(file.name)}`;
    await writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));

    const attachment = await db.attachment.create({
      data: {
        ticketId: params.id,
        fileName: file.name.slice(0, 200),
        fileUrl: stored, // storage key (served via /api/attachments/:id)
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
      },
    });
    return NextResponse.json({ data: attachment }, { status: 201 });
  } catch (e) {
    console.error("[POST attachments]", e);
    return authErrorResponse(e) ?? NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
