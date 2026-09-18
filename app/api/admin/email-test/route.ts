import { NextRequest, NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";
import { sendMail } from "@/lib/email/mailer";
import { z } from "zod";

const schema = z.object({ to: z.string().email() });

// POST /api/admin/email-test { to } — verify SMTP delivers (admin only).
export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Valid 'to' email required" }, { status: 400 });
    const sent = await sendMail({
      to: parsed.data.to,
      subject: "NexusDesk email test",
      text: `Hi ${user.name ?? "admin"},\n\nIf you received this, outbound email from NexusDesk is working.\n\n— NexusDesk`,
    });
    return NextResponse.json({ data: { sent } });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
