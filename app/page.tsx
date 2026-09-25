import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">ExclDesk</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        IT service management your team will actually enjoy
      </h1>
      <p className="max-w-xl text-muted-foreground">
        An original ITSM & help-desk workspace: ticketing, knowledge base, service catalog,
        SLA tracking, approvals, and team analytics — with strict role-based access control.
      </p>
      <div className="flex gap-3">
        <Link href="/login"><Button size="lg">Sign in</Button></Link>
        <Link href="/dashboard"><Button size="lg" variant="outline">Open dashboard</Button></Link>
      </div>
      <div className="mt-4 grid w-full gap-3 text-left sm:grid-cols-3">
        {[
          ["Ticketing", "Portal, email, chat & API intake with SLA policies and automations."],
          ["Knowledge", "Searchable self-service articles to deflect tickets."],
          ["Catalog & approvals", "Service requests with manager approval flows."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border p-4">
            <p className="font-semibold">{t}</p>
            <p className="text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Demo logins: admin@ / lead@ / agent@ / requester@excldesk.local · Password123!</p>
    </main>
  );
}
