"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminSlaPage() {
  const { data } = useQuery({ queryKey: ["sla"], queryFn: async () => (await fetch("/api/sla")).json() });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(data?.data ?? []).map((s: { id: string; name: string; priority: string; firstResponseMins: number; resolutionMins: number }) => (
        <Card key={s.id}>
          <CardHeader><CardTitle className="text-base">{s.name} ({s.priority})</CardTitle></CardHeader>
          <CardContent className="text-sm">First response: {s.firstResponseMins}m · Resolution: {s.resolutionMins}m</CardContent>
        </Card>
      ))}
    </div>
  );
}
