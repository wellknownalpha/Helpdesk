import { TicketComposer } from "@/components/tickets/TicketComposer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewTicketPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">New ticket</h1>
      <Card><CardHeader><CardTitle>Describe your issue</CardTitle></CardHeader>
      <CardContent><TicketComposer /></CardContent></Card>
    </div>
  );
}
