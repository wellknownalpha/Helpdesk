"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cannedResponses } from "@/lib/canned-responses";
import { formatDate } from "@/lib/utils";

async function postComment(ticketId: string, body: string, isInternal: boolean) {
  const res = await fetch(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, isInternal }),
  });
  if (!res.ok) throw new Error("Failed to post comment");
  return res.json();
}

export function ActivityFeed({ ticketId, initialComments, canSeeInternal }: {
  ticketId: string;
  initialComments: { id: string; body: string; isInternal: boolean; createdAt: string; author: { name: string; role: string } }[];
  canSeeInternal: boolean;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const mutation = useMutation({
    mutationFn: () => postComment(ticketId, body, isInternal),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["ticket", ticketId] }); window.location.reload(); },
  });
  const visible = initialComments.filter((c) => canSeeInternal || !c.isInternal);
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {visible.map((c) => (
          <div key={c.id} className={`rounded-lg border p-3 ${c.isInternal ? "border-amber-300 bg-amber-50" : "bg-card"}`}>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.author.name}</span>
              <Badge variant="outline">{c.author.role}</Badge>
              {c.isInternal && <Badge variant="warning">INTERNAL</Badge>}
              <span>{formatDate(c.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{c.body}</p>
          </div>
        ))}
        {visible.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        {canSeeInternal && (
          <div className="flex flex-wrap gap-2">
            {cannedResponses.map((c) => (
              <Button key={c.id} type="button" variant="outline" size="sm" onClick={() => setBody(c.body)}>{c.title}</Button>
            ))}
          </div>
        )}
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply..." rows={3} />
        <div className="flex items-center justify-between">
          {canSeeInternal ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
              Internal note
            </label>
          ) : <span />}
          <Button disabled={!body.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Posting..." : "Post reply"}
          </Button>
        </div>
        {mutation.isError && <p className="text-sm text-red-600">Failed to post. Try again.</p>}
      </div>
    </div>
  );
}
