"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { formatDate, slaRemaining, isBreached } from "@/lib/utils";
import Link from "next/link";

async function fetchTickets(params: Record<string, string>) {
  const sp = new URLSearchParams(params);
  const res = await fetch(`/api/tickets?${sp.toString()}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function TicketList({ showMineToggle = false }: { showMineToggle?: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [type, setType] = useState("all");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page), pageSize: "15" };
  if (q) params.q = q;
  if (status !== "all") params.status = status;
  if (priority !== "all") params.priority = priority;
  if (type !== "all") params.type = type;
  if (mine) params.mine = "true";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tickets", params],
    queryFn: () => fetchTickets(params),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search subject or description..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="max-w-sm" />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["NEW", "OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => { setPriority(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE_REQUEST", "QUESTION"].map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        {showMineToggle && (
          <Button variant={mine ? "default" : "outline"} onClick={() => setMine(!mine)}>Assigned to me</Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading tickets...</p>}
      {isError && <p className="text-sm text-red-600">Failed to load tickets.</p>}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Requester</th>
              <th className="px-4 py-2">SLA</th>
              <th className="px-4 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data ?? []).map((t: Record<string, never>) => (
              <tr key={t.id as string} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">NX-{t.ticketNumber as number}</td>
                <td className="px-4 py-2">
                  <Link href={`/tickets/${t.id as string}`} className="font-medium text-primary hover:underline">{t.subject as string}</Link>
                  <div className="text-xs text-muted-foreground">{(t.assignedAgent as { name: string } | null)?.name ?? (t.assignedTeam as { name: string } | null)?.name ?? "Unassigned"}</div>
                </td>
                <td className="px-4 py-2"><StatusBadge status={t.status as string} /></td>
                <td className="px-4 py-2"><PriorityBadge priority={t.priority as string} /></td>
                <td className="px-4 py-2">{(t.requester as { name: string }).name}</td>
                <td className={`px-4 py-2 text-xs ${isBreached(t.dueDate as string, t.status as string) ? "font-semibold text-red-600" : ""}`}>{slaRemaining(t.dueDate as string)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(t.updatedAt as string)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && (data?.data ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No tickets found.</p>}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-sm">Page {page} · {data?.total ?? 0} tickets</span>
        <Button variant="outline" size="sm" disabled={(data?.data ?? []).length < 15} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
