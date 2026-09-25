"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

type User = {
  id: string; name: string; email: string; role: string; isActive: boolean;
  teamId?: string | null; departmentId?: string | null;
  team?: { name: string } | null; department?: { name: string } | null;
};

const ROLES = ["REQUESTER", "AGENT", "TEAM_LEAD", "ADMIN"];

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    try {
      const f = JSON.parse(e.message);
      if (f.formErrors?.length) return f.formErrors.join(", ");
      const fields = f.fieldErrors ? Object.values(f.fieldErrors).flat() : [];
      if (fields.length) return (fields as string[]).join(", ");
    } catch { /* plain message */ }
    return e.message;
  }
  return "Request failed";
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", role: "REQUESTER", password: "" });
  const [createError, setCreateError] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [editFields, setEditFields] = useState({ name: "", role: "REQUESTER", teamId: "", departmentId: "", isActive: true, password: "" });
  const [editError, setEditError] = useState("");
  const [search, setSearch] = useState("");

  const { data: usersData, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: async () => api("/api/users", "GET") });
  const { data: teamsData } = useQuery({ queryKey: ["admin-teams"], queryFn: async () => api("/api/teams", "GET") });
  const { data: deptsData } = useQuery({ queryKey: ["admin-depts"], queryFn: async () => api("/api/departments", "GET") });

  const users: User[] = usersData?.data ?? [];
  const teams: { id: string; name: string }[] = teamsData?.data ?? [];
  const depts: { id: string; name: string }[] = deptsData?.data ?? [];

  const create = useMutation({
    mutationFn: () => api("/api/users", "POST", { ...form, password: form.password || undefined }),
    onSuccess: () => {
      setForm({ name: "", email: "", role: "REQUESTER", password: "" });
      setCreateError("");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setCreateError(errMsg(e)),
  });

  function startEdit(u: User) {
    setEditing(u);
    setEditError("");
    setEditFields({ name: u.name, role: u.role, teamId: u.teamId ?? "", departmentId: u.departmentId ?? "", isActive: u.isActive, password: "" });
  }

  const save = useMutation({
    mutationFn: () => api(`/api/users/${editing!.id}`, "PATCH", {
      name: editFields.name, role: editFields.role,
      teamId: editFields.teamId || null, departmentId: editFields.departmentId || null,
      isActive: editFields.isActive, password: editFields.password || undefined,
    }),
    onSuccess: () => { setEditing(null); setEditError(""); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => setEditError(errMsg(e)),
  });

  const toggle = useMutation({
    mutationFn: (u: User) => api(`/api/users/${u.id}`, "PATCH", { isActive: !u.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e) => alert(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: (u: User) => api(`/api/users/${u.id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e) => alert(errMsg(e)),
  });

  const filtered = users.filter((u) =>
    !search || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Add user</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-44" placeholder="Full name" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-60" placeholder="user@company.com" /></div>
            <div><Label>Role</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div><Label>Password (optional)</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-44" placeholder="Default: Password123!" /></div>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Adding..." : "Add user"}
            </Button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
        </CardContent>
      </Card>

      <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading && <p className="text-sm text-muted-foreground">Loading users...</p>}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr>
            <th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Team / Dept</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2 text-xs">{u.team?.name ?? "—"} / {u.department?.name ?? "—"}</td>
                <td className="px-3 py-2">{u.isActive ? <span className="text-green-700">Active</span> : <span className="text-red-600">Inactive</span>}</td>
                <td className="px-3 py-2 text-right">
                  <span className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => startEdit(u)}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => toggle.mutate(u)}>{u.isActive ? "Deactivate" : "Activate"}</Button>
                    <Button size="sm" variant="destructive" disabled={remove.isPending || u.id === editing?.id} onClick={() => { if (confirm(`Delete user "${u.email}"? This cannot be undone.`)) remove.mutate(u); }}>Delete</Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No users found.</p>}
      </div>

      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">Edit {editing.email}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <div><Label>Name</Label><Input value={editFields.name} onChange={(e) => setEditFields({ ...editFields, name: e.target.value })} className="w-44" /></div>
              <div><Label>Role</Label>
                <select value={editFields.role} onChange={(e) => setEditFields({ ...editFields, role: e.target.value })} className={inputCls}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div><Label>Team</Label>
                <select value={editFields.teamId} onChange={(e) => setEditFields({ ...editFields, teamId: e.target.value })} className={inputCls}>
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div><Label>Department</Label>
                <select value={editFields.departmentId} onChange={(e) => setEditFields({ ...editFields, departmentId: e.target.value })} className={inputCls}>
                  <option value="">No department</option>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editFields.isActive} onChange={(e) => setEditFields({ ...editFields, isActive: e.target.checked })} /> Active
              </label>
              <div><Label>Reset password</Label><Input type="password" value={editFields.password} onChange={(e) => setEditFields({ ...editFields, password: e.target.value })} className="w-44" placeholder="Leave blank to keep" /></div>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving..." : "Save"}</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
            {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
