import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { sendMail } from "@/lib/email/mailer";

const requestSchema = z.object({ email: z.string().trim().email().max(254) });
const genericMessage = "If an active account matches that email, a password reset link will be sent.";

export async function POST(req: NextRequest) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, isActive: true } });
    if (!user || !user.isActive) return NextResponse.json({ message: genericMessage });

    const recentToken = await db.passwordResetToken.findFirst({
      where: { userId: user.id, consumedAt: null, createdAt: { gt: new Date(Date.now() - 5 * 60 * 1000) } },
      select: { id: true },
    });
    if (recentToken) return NextResponse.json({ message: genericMessage });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const baseUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? req.nextUrl.origin;
    const resetUrl = new URL("/reset-password", baseUrl);
    resetUrl.searchParams.set("token", rawToken);
    const sent = await sendMail({
      to: user.email,
      subject: "Reset your ExclDesk password",
      text: `Hi ${user.name},\n\nUse this link within 60 minutes to reset your password:\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Hi ${user.name.replace(/[&<>"']/g, "")},</p><p>Use this link within 60 minutes to reset your password:</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
    if (!sent) await db.passwordResetToken.deleteMany({ where: { tokenHash } });

    return NextResponse.json({ message: genericMessage });
  } catch (error) {
    console.error("[password-reset/request] failed", error);
    return NextResponse.json({ error: "Could not process the request. Please try again later." }, { status: 500 });
  }
}
