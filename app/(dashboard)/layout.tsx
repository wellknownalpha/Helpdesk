import Link from "next/link";
import { auth, signOut } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/Topbar";

const nav: { href: string; label: string; roles: string[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["REQUESTER", "AGENT", "TEAM_LEAD", "ADMIN"] },
  { href: "/tickets", label: "Tickets", roles: ["REQUESTER", "AGENT", "TEAM_LEAD", "ADMIN"] },
  { href: "/knowledge", label: "Knowledge", roles: ["REQUESTER", "AGENT", "TEAM_LEAD", "ADMIN"] },
  { href: "/catalog", label: "Catalog", roles: ["REQUESTER", "AGENT", "TEAM_LEAD", "ADMIN"] },
  { href: "/approvals", label: "Approvals", roles: ["REQUESTER", "AGENT", "TEAM_LEAD", "ADMIN"] },
  { href: "/reports", label: "Reports", roles: ["AGENT", "TEAM_LEAD", "ADMIN"] },
  { href: "/team", label: "Team", roles: ["TEAM_LEAD", "ADMIN"] },
  { href: "/admin", label: "Admin", roles: ["ADMIN"] },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as unknown as { name?: string; email?: string; role?: string } | undefined;
  if (!user?.email) redirect("/login");
  const role = user.role ?? "REQUESTER";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r bg-muted/30 p-4 md:flex">
        <Link href="/dashboard" className="mb-6 text-xl font-bold">ExclDesk</Link>
        <nav className="flex flex-col gap-1">
          {nav.filter((n) => n.roles.includes(role)).map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm hover:bg-accent">{n.label}</Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t pt-4 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email} · {role}</p>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <Button variant="outline" size="sm" type="submit">Sign out</Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} name={user.name ?? "User"} email={user.email ?? ""} />
        <nav className="flex gap-3 overflow-x-auto border-b p-3 text-sm md:hidden">
          {nav.filter((n) => n.roles.includes(role)).map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded bg-muted px-2 py-1">{n.label}</Link>
          ))}
        </nav>
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
