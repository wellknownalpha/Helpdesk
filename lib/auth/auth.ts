import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db/prisma";
import { authConfig } from "./auth.config";

// NODE-ONLY auth (route handlers, server components, server actions).
// Extends the edge-safe authConfig with real credential verification and
// fresh role/team lookups on each request.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user || !user.isActive) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          teamId: user.teamId,
          departmentId: user.departmentId,
        } as unknown as { id: string; name: string; email: string };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { role?: string; teamId?: string | null; departmentId?: string | null };
        token.role = u.role;
        token.teamId = u.teamId;
        token.departmentId = u.departmentId;
        return token;
      }
      // Refresh role/team on each request (keeps RBAC fresh; cheap indexed lookup).
      if (token.sub) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub },
          select: { role: true, teamId: true, departmentId: true, isActive: true },
        });
        if (!dbUser || !dbUser.isActive) return { ...token, role: undefined };
        token.role = dbUser.role;
        token.teamId = dbUser.teamId;
        token.departmentId = dbUser.departmentId;
      }
      return token;
    },
  },
});
