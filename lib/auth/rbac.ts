import type { Role } from "@prisma/client";

export const ROLE_HIERARCHY: Record<Role, number> = {
  REQUESTER: 1,
  AGENT: 2,
  TEAM_LEAD: 3,
  ADMIN: 4,
};

export function hasRole(userRole: Role | undefined, required: Role): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];
}

export function canViewTicket(
  user: { id: string; role: Role; teamId?: string | null },
  ticket: { requesterId: string; assignedAgentId?: string | null; assignedTeamId?: string | null }
): boolean {
  if (user.role === "ADMIN" || user.role === "TEAM_LEAD") return true;
  if (user.role === "AGENT") {
    if (ticket.assignedAgentId === user.id) return true;
    if (ticket.assignedTeamId && ticket.assignedTeamId === user.teamId) return true;
    // Agents can see unassigned team pool + own requests
    if (!ticket.assignedAgentId) return true;
    return ticket.requesterId === user.id;
  }
  return ticket.requesterId === user.id;
}

export function canEditTicket(user: { id: string; role: Role }, ticket: { requesterId: string }): boolean {
  if (user.role === "ADMIN" || user.role === "TEAM_LEAD" || user.role === "AGENT") return true;
  return ticket.requesterId === user.id;
}

export const ROUTE_PERMISSIONS: { pattern: RegExp; roles: Role[] }[] = [
  { pattern: /^\/admin/, roles: ["ADMIN"] },
  { pattern: /^\/reports/, roles: ["AGENT", "TEAM_LEAD", "ADMIN"] },
  { pattern: /^\/team/, roles: ["TEAM_LEAD", "ADMIN"] },
];
