import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const links = [
    ["/admin", "Overview"],
    ["/admin/users", "Users"],
    ["/admin/teams", "Teams"],
    ["/admin/departments", "Departments"],
    ["/admin/sla", "SLA Policies"],
    ["/admin/email", "Email"],
    ["/admin/automations", "Automations"],
    ["/admin/audit-logs", "Audit Logs"],
  ] as const;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Administration</h1>
      <nav className="flex flex-wrap gap-2">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
