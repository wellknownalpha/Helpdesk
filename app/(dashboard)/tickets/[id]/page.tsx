import { db } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { ActivityFeed } from "@/components/tickets/ActivityFeed";
import { formatDate, slaRemaining } from "@/lib/utils";
import { TicketActions } from "./actions";
import { AssignCard } from "@/components/tickets/AssignCard";
import { TagsCard } from "@/components/tickets/TagsCard";
import { AttachmentsCard } from "@/components/tickets/AttachmentsCard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as unknown as { role: string; id: string }).role;
  const userId = (session.user as unknown as { id: string }).id;

  const ticket = await db.ticket.findUnique({
    where: { id: params.id },
    include: {
      requester: true,
      assignedAgent: true,
      assignedTeam: true,
      department: true,
      slaPolicy: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      history: { orderBy: { createdAt: "desc" }, take: 30 },
      tags: { include: { tag: true } },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!ticket) notFound();
  if (role === "REQUESTER" && ticket.requesterId !== userId) redirect("/tickets");

  const canSeeInternal = role !== "REQUESTER";
  const visibleComments = canSeeInternal ? ticket.comments : ticket.comments.filter((c) => !c.isInternal);
  const breached =
    ticket.dueDate != null &&
    ticket.dueDate.getTime() < Date.now() &&
    ticket.status !== "RESOLVED" &&
    ticket.status !== "CLOSED";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div>
          <Link href="/tickets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to tickets
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">EXC-{ticket.ticketNumber}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{ticket.subject}</h1>
            </div>
            <div className="flex shrink-0 gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{ticket.type.replace("_", " ")}</span>
            <span aria-hidden="true">·</span>
            <span>Received via {ticket.source.toLowerCase()}</span>
          </div>
          {breached && (
            <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              SLA breached — due {formatDate(ticket.dueDate)}. Escalate or reassign priority.
            </p>
          )}
        </div>
        <Card><CardHeader><CardTitle>Description</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{ticket.description}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Activity</CardTitle></CardHeader>
          <CardContent>
            <ActivityFeed
              ticketId={ticket.id}
              canSeeInternal={canSeeInternal}
              initialComments={visibleComments.map((c) => ({
                id: c.id, body: c.body, isInternal: c.isInternal,
                createdAt: c.createdAt.toISOString(),
                author: { name: c.author.name, role: c.author.role },
              }))}
            />
          </CardContent></Card>
        <Card><CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {ticket.history.map((h) => (
                <li key={h.id} className="text-muted-foreground">
                  <span className="font-medium text-foreground">{h.field}</span> {h.oldValue ? `${h.oldValue} → ` : ""}{h.newValue} · {formatDate(h.createdAt)}
                </li>
              ))}
              {ticket.history.length === 0 && <li className="text-muted-foreground">No changes yet.</li>}
            </ul>
          </CardContent></Card>
      </div>
      <div className="space-y-4">
        <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Requester:</span> {ticket.requester.name} ({ticket.requester.email})</p>
            <p><span className="text-muted-foreground">Agent:</span> {ticket.assignedAgent?.name ?? "Unassigned"}</p>
            <p><span className="text-muted-foreground">Team:</span> {ticket.assignedTeam?.name ?? "—"}</p>
            <p><span className="text-muted-foreground">Department:</span> {ticket.department?.name ?? "—"}</p>
            <p><span className="text-muted-foreground">SLA:</span> {ticket.slaPolicy?.name ?? "—"} · {slaRemaining(ticket.dueDate)}</p>
            <p><span className="text-muted-foreground">Created:</span> {formatDate(ticket.createdAt)}</p>
          </CardContent></Card>
        {canSeeInternal && (
          <AssignCard
            ticketId={ticket.id}
            current={{ agentId: ticket.assignedAgentId, teamId: ticket.assignedTeamId, departmentId: ticket.departmentId }}
          />
        )}
        <TagsCard
          ticketId={ticket.id}
          initial={ticket.tags.map((t) => ({ id: t.tag.id, name: t.tag.name }))}
          canEdit={canSeeInternal}
        />
        <AttachmentsCard
          ticketId={ticket.id}
          initial={ticket.attachments.map((a) => ({ id: a.id, fileName: a.fileName, fileSize: a.fileSize, createdAt: a.createdAt.toISOString() }))}
          canDelete={canSeeInternal}
        />
        <TicketActions ticketId={ticket.id} status={ticket.status} priority={ticket.priority} role={role} />
      </div>
    </div>
  );
}
