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

export default function AdminDepartmentsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["admin-depts"], queryFn: () => api("/api/departments", "GET") });
  const depts: { id: string; name: string; description?: string | null; _count: { users: number; tickets: number } }[] = data?.data ?? [];

  const create = useMutation({
    mutationFn: () => api("/api/departments", "POST", { name, description: description || null }),
    onSuccess: () => { setName(""); setDescription(""); setError(""); qc.invalidateQueries({ queryKey: ["admin-depts"] }); },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/departments/${id}`, "DELETE"),
    onSuccess: () => { setError(""); qc.invalidateQueries({ queryKey: ["admin-depts"] }); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">New department</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="w-52" placeholder="e.g. Finance" /></div>
            <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="w-72" placeholder="What this department does" /></div>
            <Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>Create department</Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading departments...</p>}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr>
            <th className="px-3 py-2">Name</th><th className="px-3 py-2">Description</th>
            <th className="px-3 py-2">Users</th><th className="px-3 py-2">Tickets</th><th className="px-3 py-2 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {depts.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2 font-medium">{d.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{d.description || "—"}</td>
                <td className="px-3 py-2">{d._count.users}</td>
                <td className="px-3 py-2">{d._count.tickets}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete department "${d.name}"?`)) remove.mutate(d.id); }}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
