import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsChart } from "@/components/dashboard/StatsChart";
import { headers } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";

async function getStats() {
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  // Server-component direct DB fallback avoided; use absolute fetch with cookies
  const { db } = await import("@/lib/db/prisma");
  const { requireSession } = await import("@/lib/auth/helpers");
  try {
    const user = await requireSession();
    const scope = user.role === "REQUESTER" ? { requesterId: user.id } : user.role === "AGENT" ? { assignedAgentId: user.id } : {};
    const [total, open, pending, breached] = await Promise.all([
      db.ticket.count({ where: scope }),
      db.ticket.count({ where: { ...scope, status: { in: ["NEW", "OPEN", "IN_PROGRESS"] } } }),
      db.ticket.count({ where: { ...scope, status: "PENDING" } }),
      db.ticket.count({ where: { ...scope, dueDate: { lt: new Date() }, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    ]);
    const all = await db.ticket.findMany({ where: scope, select: { status: true, priority: true } });
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const t of all) { byStatus[t.status] = (byStatus[t.status] ?? 0) + 1; byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1; }
    return { total, open, pending, breached, byStatus, byPriority, host: `${proto}://${host}` };
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const stats = await getStats();
  const cards = [
    ["Total tickets", stats?.total ?? 0],
    ["Open", stats?.open ?? 0],
    ["Pending", stats?.pending ?? 0],
    ["SLA breached", stats?.breached ?? 0],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/tickets/new"><Button>New ticket</Button></Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{value}</p></CardContent></Card>
        ))}
      </div>
      <StatsChart byStatus={stats?.byStatus ?? {}} byPriority={stats?.byPriority ?? {}} />
    </div>
  );
}
