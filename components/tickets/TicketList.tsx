"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { formatDate, slaRemaining, isBreached } from "@/lib/utils";
import Link from "next/link";
import { CheckSquare, RefreshCw, X } from "lucide-react";

async function fetchTickets(params: Record<string, string>) {
  const sp = new URLSearchParams(params);
  const res = await fetch(`/api/tickets?${sp.toString()}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function TicketList({ showMineToggle = false }: { showMineToggle?: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [requesterId, setRequesterId] = useState("all");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignmentTarget, setAssignmentTarget] = useState("");
  const [selectingAll, setSelectingAll] = useState(false);

  const params: Record<string, string> = { page: String(page), pageSize: "15" };
  if (q) params.q = q;
  if (status !== "all") params.status = status;
  if (priority !== "all") params.priority = priority;
  if (requesterId !== "all") params.requesterId = requesterId;
  if (mine) params.mine = "true";

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["tickets", params],
    queryFn: () => fetchTickets(params),
    refetchInterval: 1000,
    staleTime: 0,
  });

  const { data: requesterData } = useQuery({
    queryKey: ["ticket-requesters"],
    queryFn: async () => {
      const res = await fetch("/api/tickets?requesters=true");
      if (!res.ok) throw new Error("Failed to load requesters");
      return res.json();
    },
  });
  const requesters: { id: string; name: string; email: string }[] = requesterData?.data ?? [];

  const { data: teamData } = useQuery({
    queryKey: ["bulk-assignment-targets"],
    queryFn: async () => {
      const res = await fetch("/api/teams");
      if (!res.ok) throw new Error("Failed to load assignment targets");
      return res.json();
    },
  });
  const teams: { id: string; name: string; members: { id: string; name: string; email: string; role: string }[] }[] = teamData?.data ?? [];
  const agents = [...new Map(teams.flatMap((team) => team.members
    .filter((member) => member.role === "AGENT" || member.role === "TEAM_LEAD")
    .map((member) => [member.id, { ...member, teamId: team.id } as typeof member & { teamId: string }]))).values()];
  const tickets: Record<string, unknown>[] = data?.data ?? [];
  const currentPageIds = tickets.map((ticket) => ticket.id as string);
  const allCurrentPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 15));

  async function selectAllMatchingTickets() {
    setSelectingAll(true);
    try {
      const ids: string[] = [];
      const pageSize = 100;
      const firstPage = await fetchTickets({ ...params, page: "1", pageSize: String(pageSize) });
      ids.push(...(firstPage.data as { id: string }[]).map((ticket) => ticket.id));
      const pageCount = Math.ceil(firstPage.total / pageSize);
      for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
        const result = await fetchTickets({ ...params, page: String(pageNumber), pageSize: "100" });
        ids.push(...(result.data as { id: string }[]).map((ticket) => ticket.id));
      }
      setSelectedIds(ids);
    } catch {
      window.alert("Could not select all matching tickets. Please try again.");
    } finally {
      setSelectingAll(false);
    }
  }

  const closeTicket = useMutation({
    mutationFn: (ticketId: string) => fetch(`/api/tickets/${ticketId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED" }) }).then(async (res) => {
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(typeof result?.error === "string" ? result.error : "Could not close this ticket.");
      }
      return res.json();
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
    onError: (error: Error) => window.alert(error.message),
  });

  const bulkClose = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(selectedIds.map(async (ticketId) => {
        const res = await fetch(`/api/tickets/${ticketId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CLOSED" }),
        });
        if (!res.ok) throw new Error(`Failed to close ${ticketId}`);
      }));
      return {
        succeeded: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
      };
    },
    onSuccess: ({ succeeded, failed }) => {
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["tickets"] });
      if (succeeded > 0 || failed > 0) window.alert(`Closed ${succeeded} ticket${succeeded === 1 ? "" : "s"}.${failed > 0 ? ` ${failed} failed; refresh and retry those tickets.` : ""}`);
    },
  });

  const bulkAssign = useMutation({
    mutationFn: async () => {
      const [assignmentField, value] = assignmentTarget.split(":", 2);
      const payload = assignmentField === "team"
        ? { assignedTeamId: value, assignedAgentId: null }
        : { assignedAgentId: value, assignedTeamId: agents.find((agent) => agent.id === value)?.teamId ?? null };
      const results = await Promise.allSettled(selectedIds.map(async (ticketId) => {
        const res = await fetch(`/api/tickets/${ticketId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Failed to assign ${ticketId}`);
      }));
      return {
        succeeded: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
      };
    },
    onSuccess: ({ succeeded, failed }) => {
      setSelectedIds([]);
      setAssignmentTarget("");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      if (succeeded > 0 || failed > 0) window.alert(`Updated ${succeeded} ticket assignment${succeeded === 1 ? "" : "s"}.${failed > 0 ? ` ${failed} failed; refresh and retry those tickets.` : ""}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search subject, description, or ticket #..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); setSelectedIds([]); }} className="max-w-sm" />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); setSelectedIds([]); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["NEW", "OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => { setPriority(v); setPage(1); setSelectedIds([]); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={requesterId} onValueChange={(v) => { setRequesterId(v); setPage(1); setSelectedIds([]); }}>
          <SelectTrigger className="w-[210px]"><SelectValue placeholder="Requester" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requesters</SelectItem>
            {requesters.map((requester) => <SelectItem key={requester.id} value={requester.id}>{requester.name} · {requester.email}</SelectItem>)}
          </SelectContent>
        </Select>
        {showMineToggle && (
          <Button variant={mine ? "default" : "outline"} onClick={() => { setMine(!mine); setPage(1); setSelectedIds([]); }}>Assigned to me</Button>
        )}
        {showMineToggle && (
          <>
            <Select value={assignmentTarget} onValueChange={setAssignmentTarget}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Assign selected to..." /></SelectTrigger>
              <SelectContent>
                {teams.map((team) => <SelectItem key={`team:${team.id}`} value={`team:${team.id}`}>Team · {team.name}</SelectItem>)}
                {agents.map((agent) => <SelectItem key={`agent:${agent.id}`} value={`agent:${agent.id}`}>Agent · {agent.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={selectedIds.length === 0 || !assignmentTarget || bulkAssign.isPending} onClick={() => bulkAssign.mutate()}>
              <CheckSquare className="mr-2 h-4 w-4" />Assign selected{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </Button>
          </>
        )}
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} title="Refresh tickets" aria-label="Refresh tickets">
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
        <Button disabled={selectedIds.length === 0 || bulkClose.isPending} onClick={() => bulkClose.mutate()}>
          <X className="mr-2 h-4 w-4" />Close selected{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading tickets...</p>}
      {isError && <p className="text-sm text-red-600">Failed to load tickets.</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
          {selectedIds.length < (data?.total ?? 0) && (data?.total ?? 0) > 0 && (
            <Button variant="link" size="sm" disabled={selectingAll} onClick={selectAllMatchingTickets}>
              {selectingAll ? "Selecting..." : `Select all ${data.total} matching tickets`}
            </Button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="min-w-12 text-center text-sm tabular-nums">{page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="w-10 px-3 py-2"><input className="h-4 w-4 accent-primary" type="checkbox" aria-label="Select all tickets on this page" checked={allCurrentPageSelected} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...currentPageIds])] : current.filter((id) => !currentPageIds.includes(id)))} /></th>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Requester</th>
              <th className="px-4 py-2">SLA</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id as string} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2"><input className="h-4 w-4 accent-primary" type="checkbox" aria-label={`Select EXC-${t.ticketNumber as number}`} checked={selectedIds.includes(t.id as string)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, t.id as string] : current.filter((id) => id !== t.id))} /></td>
                <td className="px-4 py-2 font-mono">EXC-{t.ticketNumber as number}</td>
                <td className="px-4 py-2">
                  <Link href={`/tickets/${t.id as string}`} className="font-medium text-primary hover:underline">{t.subject as string}</Link>
                  <div className="text-xs text-muted-foreground">{(t.assignedAgent as { name: string } | null)?.name ?? (t.assignedTeam as { name: string } | null)?.name ?? "Unassigned"}</div>
                </td>
                <td className="px-4 py-2"><StatusBadge status={t.status as string} /></td>
                <td className="px-4 py-2"><PriorityBadge priority={t.priority as string} /></td>
                <td className="px-4 py-2">{(t.requester as { name: string }).name}</td>
                <td className={`px-4 py-2 text-xs ${isBreached(t.dueDate as string, t.status as string) ? "font-semibold text-red-600" : ""}`}>{slaRemaining(t.dueDate as string)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(t.updatedAt as string)}</td>
                <td className="px-4 py-2 text-right">
                  {(t.status as string) !== "CLOSED" && <Button size="sm" variant="outline" disabled={closeTicket.isPending} onClick={() => { if (confirm(`Close EXC-${t.ticketNumber as number}?`)) closeTicket.mutate(t.id as string); }}><X className="mr-1 h-3.5 w-3.5" />Close</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && (data?.data ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No tickets found.</p>}
      </div>

    </div>
  );
}
