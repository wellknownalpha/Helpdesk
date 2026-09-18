import { describe, it, expect } from "vitest";
import { hasRole, canViewTicket } from "@/lib/auth/rbac";
import { parseInboundEmail, detectPriority } from "@/lib/email/parser";
import { computeDueDate, isSlaBreached } from "@/lib/services/sla";
import { createTicketSchema } from "@/lib/validations";

describe("rbac", () => {
  it("hierarchy: admin >= agent >= requester", () => {
    expect(hasRole("ADMIN", "AGENT")).toBe(true);
    expect(hasRole("AGENT", "ADMIN")).toBe(false);
    expect(hasRole("TEAM_LEAD", "AGENT")).toBe(true);
    expect(hasRole("REQUESTER", "AGENT")).toBe(false);
  });
  it("requester can only view own tickets", () => {
    expect(canViewTicket({ id: "u1", role: "REQUESTER" }, { requesterId: "u1" })).toBe(true);
    expect(canViewTicket({ id: "u1", role: "REQUESTER" }, { requesterId: "u2" })).toBe(false);
  });
});

describe("email parser", () => {
  it("parses From/Subject/Body", () => {
    const p = parseInboundEmail("From: alice@example.com\nSubject: VPN down\n\nCannot connect since 9am");
    expect(p.from).toContain("alice@example.com");
    expect(p.subject).toBe("VPN down");
    expect(p.body).toContain("Cannot connect");
  });
  it("detects priority", () => {
    expect(detectPriority("OUTAGE: mail down")).toBe("URGENT");
    expect(detectPriority("minor cosmetic issue")).toBe("LOW");
    expect(detectPriority("general question")).toBe("MEDIUM");
  });
});

describe("sla", () => {
  it("computes due dates", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(computeDueDate(from, 60).toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });
  it("detects breach only for open tickets", () => {
    expect(isSlaBreached(new Date(Date.now() - 1000), "OPEN")).toBe(true);
    expect(isSlaBreached(new Date(Date.now() - 1000), "CLOSED")).toBe(false);
  });
});

describe("validations", () => {
  it("rejects short tickets", () => {
    expect(createTicketSchema.safeParse({ subject: "hi", description: "short" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ subject: "Valid subject here", description: "A sufficiently long description." }).success).toBe(true);
  });
});
