"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function TagsCard({ ticketId, initial, canEdit }: {
  ticketId: string;
  initial: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/tickets/${ticketId}/tags`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (res.ok) { setName(""); router.refresh(); }
  }

  async function remove(tagId: string) {
    setBusy(true);
    await fetch(`/api/tickets/${ticketId}/tags?tagId=${tagId}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {initial.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1">
              {t.name}
              {canEdit && (
                <button disabled={busy} onClick={() => remove(t.id)} className="ml-1 hover:text-destructive" aria-label={`Remove ${t.name}`}>×</button>
              )}
            </Badge>
          ))}
          {initial.length === 0 && <p className="text-sm text-muted-foreground">No tags.</p>}
        </div>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add tag..." className="h-8"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button size="sm" disabled={busy || !name.trim()} onClick={add}>Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}
