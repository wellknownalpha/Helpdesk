/**
 * NexusDesk inbound mail poller.
 *
 * Watches a support mailbox (e.g. support@company.com) over IMAP and turns
 * every unseen message into a ticket (or a threaded comment on NX-123).
 * The sender always gets an acknowledgement email via SMTP.
 *
 * Run locally:   npx tsx scripts/mail-poller.ts [--once]
 * In Docker:     docker compose --profile mail up -d   (see docker-compose.yml)
 *
 * Gmail setup: enable 2-step verification → create an App Password →
 *   IMAP_HOST=imap.gmail.com IMAP_USER=you@gmail.com IMAP_PASS=<16-char app password>
 * Outlook/M365: IMAP_HOST=outlook.office365.com with an app password (or OAuth-capable
 *   account). Any IMAP provider works.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { processInboundEmail } from "../lib/email/inbound";

const POLL_SECONDS = Number(process.env.IMAP_POLL_SECONDS ?? 60);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

async function pollOnce(client: ImapFlow): Promise<number> {
  const lock = await client.getMailboxLock(process.env.IMAP_MAILBOX ?? "INBOX");
  let handled = 0;
  try {
    const unseen = await client.search({ seen: false });
    if (!unseen) return 0;
    for (const uid of unseen) {
      try {
        const fetched = await client.fetchOne(String(uid), { envelope: true, bodyParts: ["TEXT"] });
        if (!fetched) continue;
        const raw = (fetched as { bodyParts?: Map<string, Buffer | string> }).bodyParts?.get("TEXT");
        if (!raw) continue;
        const parsed = await simpleParser(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)));
        const fromAddr = parsed.from?.value?.[0]?.address;
        if (!fromAddr) { await client.messageFlagsAdd(String(uid), ["\\Seen"]); continue; }
        // Skip our own notifications / loops.
        if (fromAddr.toLowerCase() === (process.env.SMTP_FROM ?? "").match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase()) {
          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
          continue;
        }
        const result = await processInboundEmail({
          fromEmail: fromAddr,
          fromName: parsed.from?.value?.[0]?.name,
          subject: parsed.subject ?? "(no subject)",
          body: (parsed.text ?? "").trim() || "(empty body)",
        });
        await client.messageFlagsAdd(String(uid), ["\\Seen"]);
        console.log(`[poller] ${fromAddr} → ${result.action} NX-${result.ticketNumber}`);
        handled++;
      } catch (e) {
        console.error(`[poller] failed on message ${uid}`, e);
      }
    }
  } finally {
    lock.release();
  }
  return handled;
}

async function main() {
  const once = process.argv.includes("--once");
  const client = new ImapFlow({
    host: required("IMAP_HOST"),
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user: required("IMAP_USER"), pass: required("IMAP_PASS") },
    logger: false,
  });

  await client.connect();
  console.log(`[poller] connected to ${process.env.IMAP_HOST} (mailbox: ${process.env.IMAP_MAILBOX ?? "INBOX"})`);

  if (once) {
    const n = await pollOnce(client);
    console.log(`[poller] --once done, handled ${n} message(s)`);
    await client.logout();
    process.exit(0);
  }

  for (;;) {
    try {
      const n = await pollOnce(client);
      if (n > 0) console.log(`[poller] cycle handled ${n} message(s)`);
    } catch (e) {
      console.error("[poller] cycle failed, will retry", e);
      try { await client.connect(); } catch { /* retry next cycle */ }
    }
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
  }
}

main().catch((e) => { console.error("[poller] fatal", e); process.exit(1); });
