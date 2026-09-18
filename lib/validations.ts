import { z } from "zod";

export const ticketPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const ticketStatuses = ["NEW", "OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const ticketTypes = ["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE_REQUEST", "QUESTION"] as const;

export const createTicketSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters"),
  priority: z.enum(ticketPriorities).default("MEDIUM"),
  type: z.enum(ticketTypes).default("INCIDENT"),
  departmentId: z.string().optional().nullable(),
  assignedTeamId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
});

export const updateTicketSchema = z.object({
  subject: z.string().min(5).max(200).optional(),
  description: z.string().min(10).optional(),
  status: z.enum(ticketStatuses).optional(),
  priority: z.enum(ticketPriorities).optional(),
  type: z.enum(ticketTypes).optional(),
  assignedAgentId: z.string().nullable().optional(),
  assignedTeamId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(5000),
  isInternal: z.boolean().default(false),
});

export const kbSchema = z.object({
  title: z.string().min(5).max(200),
  content: z.string().min(20),
  category: z.string().min(2).max(80),
  isPublished: z.boolean().default(false),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const userSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["REQUESTER", "AGENT", "TEAM_LEAD", "ADMIN"]),
  departmentId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const slaSchema = z.object({
  name: z.string().min(2).max(100),
  priority: z.enum(ticketPriorities),
  firstResponseMins: z.number().int().positive(),
  resolutionMins: z.number().int().positive(),
  businessHoursOnly: z.boolean().default(true),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
