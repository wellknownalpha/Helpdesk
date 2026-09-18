import { db } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminOverview() {
  const [users, tickets, articles, approvals] = await Promise.all([
    db.user.count(), db.ticket.count(), db.knowledgeArticle.count(),
    db.approvalRequest.count({ where: { status: "PENDING" } }),
  ]);
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      {[["Users", users], ["Tickets", tickets], ["KB articles", articles], ["Pending approvals", approvals]].map(([l, v]) => (
        <Card key={l as string}><CardHeader><CardTitle className="text-sm text-muted-foreground">{l}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{v}</p></CardContent></Card>
      ))}
    </div>
  );
}
