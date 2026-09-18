import type { Role, TicketPriority, TicketStatus, TicketType } from "@prisma/client";

export type { Role, TicketPriority, TicketStatus, TicketType };

export interface TicketListItem {
  id: string;
  ticketNumber: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  requester: { id: string; name: string; email: string };
  assignedAgent?: { id: string; name: string } | null;
  assignedTeam?: { id: string; name: string } | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  total: number;
  open: number;
  pending: number;
  resolvedToday: number;
  breached: number;
  avgFirstResponseMins: number | null;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

export interface SessionUserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamId?: string | null;
  departmentId?: string | null;
}
