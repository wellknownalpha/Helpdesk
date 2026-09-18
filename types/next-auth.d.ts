import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string; teamId?: string | null; departmentId?: string | null } & Record<string, unknown>;
  }
}
export type { NextAuthConfig };
