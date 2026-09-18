import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export function slaRemaining(dueDate: string | Date | null | undefined): string {
  if (!dueDate) return "No SLA";
  const diff = new Date(dueDate).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return diff < 0 ? `Breached by ${label}` : `${label} left`;
}

export function isBreached(dueDate: string | Date | null | undefined, status?: string): boolean {
  if (!dueDate) return false;
  if (status === "RESOLVED" || status === "CLOSED") return false;
  return new Date(dueDate).getTime() < Date.now();
}
