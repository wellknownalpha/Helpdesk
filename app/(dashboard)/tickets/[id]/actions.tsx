"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Check, Loader2, Merge, RotateCcw, X } from "lucide-react";

export function TicketActions({ ticketId, status, priority, role }: { ticketId: string; status: string; priority: string; role: string }) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isStaff = role !== "REQUESTER";
  const isTerminal = status === "RESOLVED" || status === "CLOSED";

  useEffect(() => {
    setNextStatus(status);
  }, [status]);

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === "string" ? result.error : "Could not update this ticket.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function merge() {
    const target = prompt("Merge into ticket ID (target):");
    if (!target) return;
    setBusy(true);
    await fetch(`/api/tickets/${ticketId}/merge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetTicketId: target }) });
    setBusy(false);
    router.push("/tickets");
  }

  return (
    <Card>
      <CardHeader className="border-b pb-4"><CardTitle className="text-base">Ticket actions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isStaff ? (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Update status</p>
              <div className="flex gap-2">
                <Select value={nextStatus} onValueChange={setNextStatus}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["NEW", "OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
                </Select>
                <Button disabled={busy || nextStatus === status} onClick={() => update({ status: nextStatus })}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Apply
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Priority</p>
              <div className="flex flex-wrap gap-2">
              {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                <Button key={p} size="sm" variant={p === priority ? "default" : "outline"} disabled={busy} onClick={() => update({ priority: p })}>{p}</Button>
              ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {status !== "CLOSED" && <Button variant="destructive" disabled={busy} onClick={() => update({ status: "CLOSED" })}><X className="mr-2 h-4 w-4" />Close ticket</Button>}
              {isTerminal && <Button variant="outline" disabled={busy} onClick={() => update({ status: "OPEN" })}><RotateCcw className="mr-2 h-4 w-4" />Reopen ticket</Button>}
              <Button variant="outline" disabled={busy} onClick={merge}><Merge className="mr-2 h-4 w-4" />Merge ticket</Button>
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            {status !== "CLOSED" && <Button variant="destructive" disabled={busy} onClick={() => update({ status: "CLOSED" })}><X className="mr-2 h-4 w-4" />Close ticket</Button>}
            {isTerminal && <Button variant="outline" disabled={busy} onClick={() => update({ status: "OPEN" })}><RotateCcw className="mr-2 h-4 w-4" />Reopen ticket</Button>}
          </div>
        )}
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </CardContent>
    </Card>
  );
}
