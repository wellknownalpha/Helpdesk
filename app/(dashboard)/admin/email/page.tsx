"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

export default function AdminEmailPage() {
  const [to, setTo] = useState("admin@nexusdesk.local");
  const [result, setResult] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["email-status"],
    queryFn: async () => (await fetch("/api/admin/email-status")).json(),
  });
  const test = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/email-test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      return d.data.sent as boolean;
    },
    onSuccess: (sent) => setResult(sent ? `Test email sent to ${to} — check inbox / MailHog.` : "Not sent — SMTP not configured or notifications disabled. See status above."),
    onError: (e: Error) => setResult(e.message),
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
        <Card>
          <CardHeader><CardTitle className="text-base">Send test email</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <div><Label>Recipient</Label><Input value={to} onChange={(e) => setTo(e.target.value)} className="w-64" /></div>
              <Button disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? "Sending..." : "Send test"}</Button>
            </div>
            {result && <p className="mt-2 text-sm text-muted-foreground">{result}</p>}
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
              <li>Start the poller: <code>docker compose --profile mail up -d</code> (or <code>npx tsx scripts/mail-poller.ts</code> natively).</li>
              <li>Email that address → ticket created, sender gets acknowledgement. Replies with <code>[NX-123]</code> in the subject thread onto the ticket.</li>
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
