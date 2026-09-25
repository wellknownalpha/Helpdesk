import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ExclDesk...");

  // Departments
  const itDept = await prisma.department.upsert({
    where: { name: "Information Technology" },
    update: {},
    create: { name: "Information Technology", description: "Core IT operations" },
  });
  const hrDept = await prisma.department.upsert({
    where: { name: "Human Resources" },
    update: {},
    create: { name: "Human Resources", description: "People operations" },
  });
  const finDept = await prisma.department.upsert({
    where: { name: "Finance" },
    update: {},
    create: { name: "Finance", description: "Finance & accounting" },
  });

  // Teams
  const supportTeam = await prisma.team.upsert({
    where: { name: "L1 Support" },
    update: {},
    create: { name: "L1 Support", description: "Frontline support team" },
  });
  const infraTeam = await prisma.team.upsert({
    where: { name: "Infrastructure" },
    update: {},
    create: { name: "Infrastructure", description: "Servers, network & cloud" },
  });

  const hash = await bcrypt.hash("Password123!", 10);

  const users = [
    { name: "Ava Admin", email: "admin@excldesk.local", role: "ADMIN" as const, employeeId: "EXC-001", departmentId: itDept.id },
    { name: "Liam Lead", email: "lead@excldesk.local", role: "TEAM_LEAD" as const, employeeId: "EXC-010", departmentId: itDept.id, teamId: supportTeam.id },
    { name: "Aria Agent", email: "agent@excldesk.local", role: "AGENT" as const, employeeId: "EXC-020", departmentId: itDept.id, teamId: supportTeam.id },
    { name: "Noah Agent", email: "agent2@excldesk.local", role: "AGENT" as const, employeeId: "EXC-021", departmentId: itDept.id, teamId: infraTeam.id },
    { name: "Mia Requester", email: "requester@excldesk.local", role: "REQUESTER" as const, employeeId: "EXC-100", departmentId: hrDept.id },
    { name: "Ethan Requester", email: "ethan@excldesk.local", role: "REQUESTER" as const, employeeId: "EXC-101", departmentId: finDept.id },
  ];

  const createdUsers: Record<string, { id: string }> = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, role: u.role, isActive: true },
      create: { ...u, passwordHash: hash },
    });
    createdUsers[u.email] = user;
  }

  // SLA policies (one per priority)
  const slaDefs = [
    { name: "Urgent SLA", priority: "URGENT" as const, firstResponseMins: 15, resolutionMins: 240 },
    { name: "High SLA", priority: "HIGH" as const, firstResponseMins: 60, resolutionMins: 480 },
    { name: "Medium SLA", priority: "MEDIUM" as const, firstResponseMins: 240, resolutionMins: 1440 },
    { name: "Low SLA", priority: "LOW" as const, firstResponseMins: 480, resolutionMins: 4320 },
  ];
  for (const s of slaDefs) {
    await prisma.slaPolicy.upsert({ where: { priority: s.priority }, update: {}, create: s });
  }

  // Tags
  for (const name of ["vpn", "laptop", "email", "network", "onboarding", "printer"]) {
    await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Knowledge base
  const kb = [
    { title: "How to reset your password", content: "Go to the portal > Profile > Security. If locked out, contact L1 Support. Passwords require 12+ chars.", category: "Account", isPublished: true },
    { title: "VPN setup guide (WireGuard)", content: "1. Install client\n2. Download profile from portal\n3. Import & connect\n4. Verify via intranet check.", category: "Network", isPublished: true },
    { title: "Requesting a new laptop", content: "Use Service Catalog > Hardware > Laptop. Manager approval required. Standard SLA 3 business days.", category: "Hardware", isPublished: true },
    { title: "Email troubleshooting", content: "Check connectivity, re-authenticate, clear cache. If 4xx/5xx persists, raise an incident.", category: "Email", isPublished: true },
    { title: "Draft: Printer migration plan", content: "Internal draft — do not publish.", category: "Hardware", isPublished: false },
  ];
  for (const a of kb) {
    const existing = await prisma.knowledgeArticle.findFirst({ where: { title: a.title } });
    if (!existing) await prisma.knowledgeArticle.create({ data: a });
  }

  // Service catalog
  const catalog = [
    { name: "New Laptop Request", description: "Standard developer/office laptop provisioning.", category: "Hardware", icon: "laptop", requiresApproval: true },
    { name: "Software License", description: "Request licensed software (IDE, design tools).", category: "Software", icon: "package", requiresApproval: true },
    { name: "VPN Access", description: "Grant remote network access.", category: "Access", icon: "shield", requiresApproval: false },
    { name: "Onboarding Kit", description: "New hire accounts, badge, and equipment.", category: "HR", icon: "user-plus", requiresApproval: true },
  ];
  for (const c of catalog) {
    const existing = await prisma.serviceItem.findFirst({ where: { name: c.name } });
    if (!existing) await prisma.serviceItem.create({ data: c });
  }

  // Sample tickets
  const requester = createdUsers["requester@excldesk.local"];
  const agent = createdUsers["agent@excldesk.local"];
  const urgentSla = await prisma.slaPolicy.findUnique({ where: { priority: "URGENT" } });
  const mediumSla = await prisma.slaPolicy.findUnique({ where: { priority: "MEDIUM" } });

  const sampleTickets = [
    { subject: "VPN disconnects every 10 minutes", description: "VPN client drops frequently since yesterday. Tried reinstall.", status: "OPEN" as const, priority: "HIGH" as const, type: "INCIDENT" as const, requesterId: requester.id, assignedAgentId: agent.id, assignedTeamId: supportTeam.id, departmentId: hrDept.id, slaPolicyId: mediumSla?.id },
    { subject: "Need Adobe license for design team", description: "2 seats required for Q3 campaign work.", status: "NEW" as const, priority: "MEDIUM" as const, type: "SERVICE_REQUEST" as const, requesterId: requester.id, assignedTeamId: supportTeam.id, departmentId: hrDept.id, slaPolicyId: mediumSla?.id },
    { subject: "Email outage — cannot send", description: "Outlook shows disconnected; OWA returns 500.", status: "IN_PROGRESS" as const, priority: "URGENT" as const, type: "INCIDENT" as const, requesterId: createdUsers["ethan@excldesk.local"].id, assignedAgentId: agent.id, assignedTeamId: infraTeam.id, departmentId: finDept.id, slaPolicyId: urgentSla?.id },
  ];
  for (const t of sampleTickets) {
    const existing = await prisma.ticket.findFirst({ where: { subject: t.subject } });
    if (!existing) await prisma.ticket.create({ data: t });
  }

  console.log("Seed complete. Logins: admin/lead/agent/requester @ excldesk.local / Password123!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
