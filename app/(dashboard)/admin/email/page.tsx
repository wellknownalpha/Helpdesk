"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminEmailPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["email-status"],
    queryFn: async () => (await fetch("/api/admin/email-status")).json(),
  });
  const s = data?.data;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-t py-1.5 text-sm first:border-0">
      <span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Outbound status</CardTitle></CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {s && (
              <div>
                {row("Notifications", s.notificationsEnabled ? "Enabled" : "DISABLED (NOTIFICATIONS_ENABLED=false)")}
                {row("SMTP", s.smtp.configured ? `${s.smtp.host}:${s.smtp.port}` : "NOT CONFIGURED")}
                {row("From address", s.smtp.from ?? "—")}
                {row("Support mailbox", s.supportMailbox ?? "—")}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Inbound status</CardTitle></CardHeader>
          <CardContent>
            {s && (
              <div>
                {row("Webhook (/api/webhooks/email)", s.webhookSecretSet ? "Protected by secret" : "OPEN — set INBOUND_WEBHOOK_SECRET in production")}
                {row("IMAP poller", s.inboundPoller.enabled ? `Enabled (${s.inboundPoller.host} / ${s.inboundPoller.mailbox}, every ${s.inboundPoller.pollSeconds}s)` : "Disabled (MAIL_INBOUND_ENABLED != true)")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">How to connect a real mailbox</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold">Option A — IMAP poller (recommended, works with Gmail/Outlook/any provider)</p>
            <ol className="list-decimal pl-5 text-muted-foreground">
              <li>Create a mailbox like <code>support@yourcompany.com</code>. For Gmail: enable 2-step verification, then create an <b>App Password</b>.</li>
              <li>Set in <code>.env</code>: <code>MAIL_INBOUND_ENABLED=true IMAP_HOST=imap.gmail.com IMAP_USER=support@… IMAP_PASS=&lt;app-password&gt;</code>, plus <code>SMTP_*</code> for sending and <code>SUPPORT_MAILBOX=support@…</code>.</li>
              <li>Start the production mail service with <code>docker compose --profile mail up -d</code>.</li>
              <li>Email that address → ticket created, sender gets acknowledgement. Replies with <code>[EXC-123]</code> in the subject thread onto the ticket.</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold">Option B — provider webhook (SendGrid / Mailgun / SES inbound parse)</p>
            <ol className="list-decimal pl-5 text-muted-foreground">
              <li>Set <code>INBOUND_WEBHOOK_SECRET</code> and point the provider at <code>https://&lt;app&gt;/api/webhooks/email</code> with header <code>x-webhook-secret</code>.</li>
              <li>Same threading + acknowledgement behavior as the poller.</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold">What gets emailed automatically</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              <li>Ticket created (portal, email, catalog) → acknowledgement to requester</li>
              <li>Public agent reply → requester · requester reply → assigned agent</li>
              <li>Status/priority/team changes → requester · new assignment → the agent</li>
              <li>Resolve/close → requester (with reopen-by-reply note)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
