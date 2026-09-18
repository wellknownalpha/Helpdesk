import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// EDGE-SAFE auth config — used by middleware (Edge Runtime).
// IMPORTANT: never import the database (Prisma) here. Middleware only needs to
// decode the JWT; role/team/department were embedded in the token at sign-in
// by the Node-side callbacks in auth.ts.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      // Placeholder: real credential verification lives in lib/auth/auth.ts
      // (Node runtime). This is never called from middleware.
      async authorize() {
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { role?: string; teamId?: string | null; departmentId?: string | null };
        token.role = u.role;
        token.teamId = u.teamId;
        token.departmentId = u.departmentId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as unknown as Record<string, unknown>).id = token.sub;
        (session.user as unknown as Record<string, unknown>).role = token.role;
        (session.user as unknown as Record<string, unknown>).teamId = token.teamId;
        (session.user as unknown as Record<string, unknown>).departmentId = token.departmentId;
      }
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
};
