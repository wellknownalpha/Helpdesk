import { auth } from "@/lib/auth/auth";
import type { Role } from "@prisma/client";
import { hasRole } from "@/lib/auth/rbac";
import { NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId?: string | null;
  departmentId?: string | null;
};

export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  const u = session?.user as unknown as SessionUser | undefined;
  if (!u?.id || !u?.role) throw new AuthError("Unauthorized", 401);
  return u;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireSession();
  const minRole = roles.sort(
    (a, b) =>
      ({ REQUESTER: 1, AGENT: 2, TEAM_LEAD: 3, ADMIN: 4 })[a] -
      ({ REQUESTER: 1, AGENT: 2, TEAM_LEAD: 3, ADMIN: 4 })[b]
  )[0];
  if (!hasRole(user.role, minRole)) throw new AuthError("Forbidden", 403);
  // If multiple distinct roles required (non-hierarchical), check membership
  if (!roles.some((r) => hasRole(user.role, r) && hierarchyEqualOrRoleAllowed(user.role, roles))) {
    // fallback strict check
    if (!roles.includes(user.role) && !hasRole(user.role, "ADMIN")) {
      // TEAM_LEAD implies AGENT etc. — allow if hierarchy covers any required role
      const allowed = roles.some((r) => hasRole(user.role, r));
      if (!allowed) throw new AuthError("Forbidden", 403);
    }
  }
  return user;
}

function hierarchyEqualOrRoleAllowed(userRole: Role, roles: Role[]): boolean {
  return roles.includes(userRole);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}
