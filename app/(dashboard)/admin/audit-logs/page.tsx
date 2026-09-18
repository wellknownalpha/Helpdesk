"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";

export default function AuditLogsPage() {
  const { data } = useQuery({ queryKey: ["audit"], queryFn: async () => (await fetch("/api/audit-logs")).json() });
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left"><tr>
          <th className="px-3 py-2">Time</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Entity</th>
        </tr></thead>
        <tbody>
          {(data?.data ?? []).map((l: { id: string; createdAt: string; action: string; entity: string; entityId: string; user?: { email: string } | null }) => (
            <tr key={l.id} className="border-t">
              <td className="px-3 py-2 text-xs">{formatDate(l.createdAt)}</td>
              <td className="px-3 py-2">{l.user?.email ?? "system"}</td>
              <td className="px-3 py-2">{l.action}</td>
              <td className="px-3 py-2 font-mono text-xs">{l.entity}:{l.entityId.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
