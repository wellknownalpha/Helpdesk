import { TicketList } from "@/components/tickets/TicketList";
import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function TicketsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as unknown as { role: string }).role;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tickets</h1>
        <Link href="/tickets/new"><Button>New ticket</Button></Link>
      </div>
      <TicketList showMineToggle={role !== "REQUESTER"} />
    </div>
  );
}
