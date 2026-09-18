"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function CatalogPage() {
  const qc = useQueryClient();
  const [justification, setJustification] = useState("");
  const { data } = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => (await fetch("/api/service-catalog")).json(),
  });
  const mutation = useMutation({
    mutationFn: async (serviceItemId: string) => {
      const res = await fetch("/api/service-catalog", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceItemId, justification }),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => { alert("Request submitted — ticket created!"); qc.invalidateQueries({ queryKey: ["catalog"] }); },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Service Catalog</h1>
      <textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Business justification (optional)" className="w-full max-w-xl rounded-md border p-2 text-sm" rows={2} />
      <div className="grid gap-4 md:grid-cols-2">
        {(data?.data ?? []).map((item: { id: string; name: string; description: string; category: string; requiresApproval: boolean }) => (
          <Card key={item.id}>
            <CardHeader><CardTitle className="text-base">{item.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{item.category}{item.requiresApproval ? " · requires approval" : ""}</p>
              <p className="text-sm">{item.description}</p>
              <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate(item.id)}>Request</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
