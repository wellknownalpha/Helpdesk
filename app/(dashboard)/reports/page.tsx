import { db } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsChart } from "@/components/dashboard/StatsChart";

export default async function ReportsPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string })?.role;
  if (!session?.user) redirect("/login");
  if (role === "REQUESTER") redirect("/dashboard");

  const [total, byStatusRaw, byPriorityRaw, breached, slaPolicies] = await Promise.all([
    db.ticket.count(),
    db.ticket.groupBy({ by: ["status"], _count: true }),
    db.ticket.groupBy({ by: ["priority"], _count: true }),
    db.ticket.count({ where: { dueDate: { lt: new Date() }, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    db.slaPolicy.findMany(),
  ]);
  const byStatus = Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count]));
  const byPriority = Object.fromEntries(byPriorityRaw.map((r) => [r.priority, r._count]));
  const avgResolution = await db.ticket.findMany({ where: { resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true }, take: 500 });
  const avgMins = avgResolution.length
    ? Math.round(avgResolution.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) / avgResolution.length / 60_000)
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports & Analytics</h1>
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Total tickets", total], ["SLA breached", breached], ["Avg resolution (min)", avgMins ?? "—"], ["SLA policies", slaPolicies.length]].map(([l, v]) => (
          <Card key={l as string}><CardHeader><CardTitle className="text-sm text-muted-foreground">{l}</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{v}</p></CardContent></Card>
        ))}
      </div>
      <StatsChart byStatus={byStatus} byPriority={byPriority} />
      <Card><CardHeader><CardTitle>SLA policies</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm">
            {slaPolicies.map((s) => (
              <li key={s.id} className="border-t py-2 first:border-0">{s.name} — {s.priority}: respond in {s.firstResponseMins}m, resolve in {s.resolutionMins}m</li>
            ))}
          </ul>
        </CardContent></Card>
    </div>
  );
}
