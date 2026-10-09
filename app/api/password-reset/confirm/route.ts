import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db/prisma";

const confirmSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(8).max(72),
});

export async function POST(req: NextRequest) {
  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? "", "utf8") > 72) {
    return NextResponse.json({ error: "Enter a valid reset link and a password between 8 and 72 bytes." }, { status: 400 });
  }

  try {
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const token = await db.passwordResetToken.findUnique({ where: { tokenHash } });
    const now = new Date();
    if (!token || token.consumedAt || token.expiresAt <= now) {
      return NextResponse.json({ error: "This reset link is invalid or expired. Request a new link." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const updated = await db.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return false;

      const userUpdate = await tx.user.updateMany({
        where: { id: token.userId, isActive: true },
        data: { passwordHash },
      });
      if (userUpdate.count !== 1) return false;

      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, id: { not: token.id } } });
      await tx.auditLog.create({
        data: {
          userId: token.userId,
          action: "PASSWORD_RESET",
          entity: "User",
          entityId: token.userId,
        },
      });
      return true;
    });

    if (!updated) {
      return NextResponse.json({ error: "This reset link is invalid or expired. Request a new link." }, { status: 400 });
    }
    return NextResponse.json({ message: "Password updated. You can now sign in." });
  } catch (error) {
    console.error("[password-reset/confirm] failed", error);
    return NextResponse.json({ error: "Could not reset the password. Please try again." }, { status: 500 });
  }
}
