"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export function TicketActions({ ticketId, status, priority, role }: { ticketId: string; status: string; priority: string; role: string }) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [busy, setBusy] = useState(false);
  const isStaff = role !== "REQUESTER";

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/tickets/${ticketId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(false);
    router.refresh();
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
      <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isStaff ? (
          <>
            <div className="flex gap-2">
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger><span>{nextStatus}</span></SelectTrigger>
                <SelectContent>
                  {["NEW", "OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button disabled={busy} onClick={() => update({ status: nextStatus })}>Apply</Button>
            </div>
            <div className="flex gap-2">
              {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                <Button key={p} size="sm" variant={p === priority ? "default" : "outline"} disabled={busy} onClick={() => update({ priority: p })}>{p}</Button>
              ))}
            </div>
            <Button variant="outline" disabled={busy} onClick={merge}>Merge ticket</Button>
          </>
        ) : (
          <div className="flex gap-2">
            {status !== "CLOSED" && <Button disabled={busy} onClick={() => update({ status: "CLOSED" })}>Close ticket</Button>}
            {status === "CLOSED" && <Button variant="outline" disabled={busy} onClick={() => update({ status: "OPEN" })}>Reopen</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
