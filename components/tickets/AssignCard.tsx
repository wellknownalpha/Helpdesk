"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Option = { id: string; name: string };

export function AssignCard({ ticketId, current }: {
  ticketId: string;
  current: { agentId?: string | null; teamId?: string | null; departmentId?: string | null };
}) {
  const router = useRouter();
  const [agents, setAgents] = useState<Option[]>([]);
  const [teams, setTeams] = useState<Option[]>([]);
  const [depts, setDepts] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then((d) => {
      setAgents(d.data?.agents ?? []);
      setTeams(d.data?.teams?.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })) ?? []);
      setDepts(d.data?.departments?.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })) ?? []);
    }).catch(() => {});
  }, []);

  async function patch(field: string, value: string | null) {
    setBusy(true);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value || null }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("Assignment failed");
  }

  const selectCls = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-50";

  return (
    <Card>
      <CardHeader><CardTitle>Assignment</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Agent</Label>
          <select className={selectCls} disabled={busy} value={current.agentId ?? ""} onChange={(e) => patch("assignedAgentId", e.target.value)}>
            <option value="">Unassigned</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Team</Label>
          <select className={selectCls} disabled={busy} value={current.teamId ?? ""} onChange={(e) => patch("assignedTeamId", e.target.value)}>
            <option value="">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Department</Label>
          <select className={selectCls} disabled={busy} value={current.departmentId ?? ""} onChange={(e) => patch("departmentId", e.target.value)}>
            <option value="">No department</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
