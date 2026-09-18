import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const rules = [
  ["auto-assign-infra-urgent", "If priority is URGENT and no team assigned → assign Infrastructure team."],
  ["auto-assign-l1-keyword", "If subject mentions password/VPN/printer → assign L1 Support."],
  ["sla-on-create", "On create, attach SLA policy matching priority and compute due date."],
  ["first-response-tracking", "First staff public reply or field change stamps firstResponseAt."],
  ["email-intake", "Inbound email webhook parses From/Subject/Body, detects priority, creates ticket."],
];

export default function AutomationsPage() {
  return (
    <div className="grid gap-4">
      {rules.map(([name, desc]) => (
        <Card key={name}><CardHeader><CardTitle className="text-base">{name}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{desc} Implemented in lib/services/tickets.ts → applyAutomationRules.</CardContent></Card>
      ))}
    </div>
  );
}
