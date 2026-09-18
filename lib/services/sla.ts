import { db } from "@/lib/db/prisma";
import type { TicketPriority } from "@prisma/client";

/** Compute due date from SLA policy resolution window. */
export function computeDueDate(from: Date, resolutionMins: number): Date {
  return new Date(from.getTime() + resolutionMins * 60_000);
}

export async function resolveSlaPolicy(priority: TicketPriority) {
  return db.slaPolicy.findUnique({ where: { priority } });
}

export function isSlaBreached(dueDate: Date | null | undefined, status: string): boolean {
  if (!dueDate) return false;
  if (status === "RESOLVED" || status === "CLOSED") return false;
  return dueDate.getTime() < Date.now();
}

export function firstResponseBreached(
  createdAt: Date,
  firstResponseAt: Date | null | undefined,
  firstResponseMins: number
): boolean {
  const deadline = createdAt.getTime() + firstResponseMins * 60_000;
  const responded = firstResponseAt ? firstResponseAt.getTime() : Date.now();
  return responded > deadline;
}
