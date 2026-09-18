"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, Download } from "lucide-react";

export function AttachmentsCard({ ticketId, initial, canDelete }: {
  ticketId: string;
  initial: { id: string; fileName: string; fileSize: number; createdAt: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true); setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/tickets/${ticketId}/attachments`, { method: "POST", body: form });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json()).error ?? "Upload failed");
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Attachments ({initial.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {initial.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
            <span className="truncate" title={a.fileName}>{a.fileName} <span className="text-xs text-muted-foreground">({Math.max(1, Math.round(a.fileSize / 1024))} KB)</span></span>
            <span className="flex shrink-0 gap-1">
              <a href={`/api/attachments/${a.id}`} className="rounded p-1 hover:bg-accent" aria-label="Download"><Download className="h-4 w-4" /></a>
              {canDelete && (
                <button disabled={busy} onClick={() => remove(a.id)} className="rounded p-1 hover:bg-accent hover:text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              )}
            </span>
          </div>
        ))}
        {initial.length === 0 && <p className="text-sm text-muted-foreground">No attachments.</p>}
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Uploading..." : "Attach file (max 10 MB)"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
