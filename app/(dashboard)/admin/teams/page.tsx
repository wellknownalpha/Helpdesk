"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}

export default function AdminTeamsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["admin-teams"], queryFn: () => api("/api/teams", "GET") });
  const teams: { id: string; name: string; description?: string | null; members: { id: string; name: string; role: string }[]; _count: { members: number; tickets: number } }[] = data?.data ?? [];

  const create = useMutation({
    mutationFn: () => api("/api/teams", "POST", { name, description: description || null }),
    onSuccess: () => { setName(""); setDescription(""); setError(""); qc.invalidateQueries({ queryKey: ["admin-teams"] }); },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/teams/${id}`, "DELETE"),
    onSuccess: () => { setError(""); qc.invalidateQueries({ queryKey: ["admin-teams"] }); },
    onError: (e: Error) => setError(e.message),
  });

  const updateMembers = useMutation({
    mutationFn: ({ teamId, userId, action }: { teamId: string; userId: string; action: "addUserId" | "removeUserId" }) => api(`/api/teams/${teamId}`, "PATCH", { [action]: userId }),
    onSuccess: (_data, variables) => {
      setMemberErrors((current) => ({ ...current, [variables.teamId]: "" }));
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error, variables) => setMemberErrors((current) => ({ ...current, [variables.teamId]: e.message })),
  });

  const { data: usersData } = useQuery({ queryKey: ["admin-users"], queryFn: () => api("/api/users", "GET") });
  const users: { id: string; name: string; teamId?: string | null }[] = usersData?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">New team</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="w-52" placeholder="e.g. Network Ops" /></div>
            <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="w-72" placeholder="What this team owns" /></div>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>Create team</Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading teams...</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.id}>
            <CardHeader><CardTitle className="text-base">{t.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{t.description || "No description"} · {t._count.members} member(s) · {t._count.tickets} ticket(s)</p>
              <ul className="max-h-32 overflow-auto">
                {t.members.map((m) => <li key={m.id} className="flex items-center justify-between border-t py-1 text-xs first:border-0"><span>{m.name} — {m.role}</span><button type="button" className="text-red-600 hover:underline" disabled={updateMembers.isPending} onClick={() => updateMembers.mutate({ teamId: t.id, userId: m.id, action: "removeUserId" })}>Remove</button></li>)}
                {t.members.length === 0 && <li className="text-xs text-muted-foreground">No members. Assign users via Admin → Users.</li>}
              </ul>
              <div className="flex flex-wrap items-end gap-2 border-t pt-2">
                <div className="min-w-0 flex-1"><Label>Add person</Label><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" defaultValue="" onChange={(e) => { if (e.target.value) updateMembers.mutate({ teamId: t.id, userId: e.target.value, action: "addUserId" }); }} disabled={updateMembers.isPending}><option value="">Select a user</option>{users.filter((u) => u.teamId !== t.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => { if (confirm(`Delete team "${t.name}"?`)) remove.mutate(t.id); }}>Delete</Button>
              </div>
              {memberErrors[t.id] && <p className="text-xs text-red-600">{memberErrors[t.id]}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
