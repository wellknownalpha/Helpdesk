import { db } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamPage() {
  const session = await auth();
  const u = session?.user as unknown as { role?: string; teamId?: string | null } | undefined;
  if (!u) redirect("/login");
  if (u.role !== "TEAM_LEAD" && u.role !== "ADMIN") redirect("/dashboard");

  const teams = await db.team.findMany({
    include: {
      members: { select: { id: true, name: true, email: true, role: true } },
      tickets: { select: { id: true, ticketNumber: true, subject: true, status: true, priority: true }, take: 20, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Team Overview</h1>
      {teams.map((t) => (
        <Card key={t.id}>
          <CardHeader><CardTitle>{t.name} · {t.members.length} members · {t.tickets.length} recent tickets</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Members</p>
              <ul className="text-sm">{t.members.map((m) => <li key={m.id} className="border-t py-1 first:border-0">{m.name} — {m.role} ({m.email})</li>)}</ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Recent tickets</p>
              <ul className="text-sm">{t.tickets.map((tk) => <li key={tk.id} className="border-t py-1 first:border-0">NX-{tk.ticketNumber} {tk.subject} [{tk.status}/{tk.priority}]</li>)}</ul>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
