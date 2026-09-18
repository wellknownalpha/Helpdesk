"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => (await fetch("/api/approvals")).json(),
  });
  const mutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch("/api/approvals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      if (!res.ok) throw new Error("forbidden — team lead/admin only");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
    onError: (e) => alert(String(e)),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Approvals</h1>
      <div className="grid gap-4">
        {(data?.data ?? []).map((a: { id: string; status: string; ticket: { id: string; subject: string; ticketNumber: number } }) => (
          <Card key={a.id}>
            <CardHeader><CardTitle className="text-base">NX-{a.ticket.ticketNumber} — {a.ticket.subject}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge>{a.status}</Badge>
              <Button size="sm" onClick={() => mutation.mutate({ id: a.id, status: "APPROVED" })}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => mutation.mutate({ id: a.id, status: "REJECTED" })}>Reject</Button>
            </CardContent>
          </Card>
        ))}
        {(data?.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No pending approvals.</p>}
      </div>
    </div>
  );
}
