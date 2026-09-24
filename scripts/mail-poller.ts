import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { processInboundEmail } from "../lib/email/inbound";

const POLL_SECONDS = Number(process.env.IMAP_POLL_SECONDS ?? 60);
const MAX_MESSAGES_PER_FOLDER = Number(process.env.IMAP_MAX_MESSAGES_PER_FOLDER ?? 100);
const LOOKBACK_DAYS = Number(process.env.IMAP_LOOKBACK_DAYS ?? 7);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function isAddressedToMailbox(parsed: Awaited<ReturnType<typeof simpleParser>>): boolean {
  const mailbox = process.env.IMAP_USER?.toLowerCase().trim();
  if (!mailbox) return true;

  const addresses = (field: typeof parsed.to) =>
    Array.isArray(field) ? field : field?.value ?? [];
  const recipients = [
    ...addresses(parsed.to),
    ...addresses(parsed.cc),
    ...addresses(parsed.bcc),
  ];
  const deliveredTo = parsed.headers.get("delivered-to");
  const recipientAddresses = recipients.flatMap((recipient) => {
    if ("address" in recipient) return recipient.address ? [recipient.address] : [];
    if ("value" in recipient) {
      return recipient.value.map((value) => value.address).filter((value): value is string => Boolean(value));
    }
    return [];
  });
  return recipientAddresses.some((address) => address.toLowerCase() === mailbox)
    || (typeof deliveredTo === "string" && deliveredTo.toLowerCase().includes(mailbox));
}

async function getMailboxCandidates(client: ImapFlow): Promise<string[]> {
  const mailboxes = await client.list();
  const candidates = new Set<string>();

  for (const box of mailboxes) {
    const path = (box as { path?: string }).path ?? (box as { name?: string }).name ?? "";
    const special = (box as { specialUse?: string }).specialUse ?? "";
    const normalized = path.trim().replace(/^"|"$/g, '');
    if (!normalized) continue;

    const upper = normalized.toUpperCase();

    // Gmail root and non-inbound special folders are not support mailboxes.
    if (normalized === "[Gmail]" || upper === "[GMAIL]" || upper === "[GMAIL]/STARRED" || upper === "[GMAIL]/SENT MAIL" || upper === "[GMAIL]/DRAFTS" || upper === "[GMAIL]/SPAM" || upper === "[GMAIL]/TRASH" || upper === "[GMAIL]/IMPORTANT") {
      continue;
    }

    if (upper === 'INBOX') {
      candidates.add('INBOX');
      continue;
    }

    // Skip built-in special folders that are not support inboxes.
    if (
      upper.includes('STARRED') ||
      upper.includes('SENT') ||
      upper.includes('DRAFT') ||
      upper.includes('TRASH') ||
      upper.includes('SPAM') ||
      upper.includes('JUNK') ||
      upper.includes('IMPORTANT') ||
      (special && [
        '\\INBOX', '\\SENT', '\\DRAFTS', '\\TRASH', '\\JUNK', '\\FLAGGED'
      ].includes(special))
    ) {
      continue;
    }

    // Use all real mailboxes, including Gmail All Mail and custom labels.
    if (normalized.includes('/') || normalized.includes(' ') || upper === 'INBOX') {
      candidates.add(normalized);
    }
  }

  if (candidates.size === 0) candidates.add(process.env.IMAP_MAILBOX ?? 'INBOX');
  return Array.from(candidates);
}

async function debugMailboxSummary(client: ImapFlow): Promise<void> {
  const mailboxes = await client.list();
  console.log(`[poller] visible mailboxes (${mailboxes.length}):`);

  for (const box of mailboxes) {
    const path = (box as { path?: string }).path ?? (box as { name?: string }).name ?? "";
    const special = (box as { specialUse?: string }).specialUse ?? "";
    const selectable = Boolean((box as { selectable?: boolean }).selectable);
    if (!path) continue;
    console.log(`  - ${path} | special=${special || "-"} | selectable=${selectable}`);
  }

  const candidates = await getMailboxCandidates(client);
  console.log(`[poller] candidate folders for processing: ${candidates.join(', ')}`);
}

async function debugVisibleMessages(client: ImapFlow): Promise<void> {
  const limit = Number(process.env.IMAP_DEBUG_LIMIT ?? 50);
  const mailboxes = await getMailboxCandidates(client);
  let displayed = 0;

  console.log(`[poller] inspecting up to ${limit} messages across ${mailboxes.length} candidate folders`);
  for (const mailbox of mailboxes) {
    if (displayed >= limit) break;
    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
      const uids = await client.search({ all: true });
      const recentUids = (Array.isArray(uids) ? uids : []).slice(-Math.min(20, limit - displayed));
      for (const uid of recentUids) {
        const fetched = await client.fetchOne(String(uid), { envelope: true });
        if (typeof fetched === "undefined" || fetched === false) continue;
        const envelope = fetched.envelope;
        if (!envelope) continue;
        console.log(JSON.stringify({
          mailbox,
          uid,
          from: envelope.from?.map((value) => value.address).filter(Boolean),
          to: envelope.to?.map((value) => value.address).filter(Boolean),
          subject: envelope.subject ?? "(no subject)",
          date: envelope.date ?? null,
          flags: fetched?.flags ?? [],
        }));
        displayed++;
        if (displayed >= limit) break;
      }
    } catch (error) {
      console.error(`[poller] debug failed for ${mailbox}:`, error);
    } finally {
      lock?.release();
    }
  }
  console.log(`[poller] displayed ${displayed} visible message(s)`);
}

async function pollOnce(client: ImapFlow): Promise<number> {
  const mailboxes = await getMailboxCandidates(client);
  const seenMessageIds = new Set<string>();
  let handled = 0;

  for (const mailbox of mailboxes) {
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Do not turn every historical message in a Gmail label into a ticket.
      // A deliberate backfill mode can be added separately when needed.
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const unreadUids = await client.search({ seen: false, since });
      const uids = (Array.isArray(unreadUids) ? unreadUids : []).slice(-MAX_MESSAGES_PER_FOLDER);
      if (!uids || uids.length === 0) continue;

      for (const uid of uids) {
        try {
          const fetched = await client.fetchOne(String(uid), { source: true });
          if (!fetched) continue;
          const raw = (fetched as { source?: Buffer }).source;
          if (!raw) {
            console.log(`[poller] skipped uid=${uid} in ${mailbox}: message body unavailable`);
            continue;
          }

          const parsed = await simpleParser(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)));
          const fromAddr = parsed.from?.value?.[0]?.address;
          if (!fromAddr) {
            console.log(`[poller] skipped uid=${uid} in ${mailbox}: missing sender`);
            continue;
          }

          if (!isAddressedToMailbox(parsed)) {
            console.log(`[poller] skipped uid=${uid} in ${mailbox}: not addressed to ${process.env.IMAP_USER}`);
            continue;
          }

          const messageId = (parsed.headerLines.find((h) => h.key.toLowerCase() === 'message-id')?.line ?? '').trim();
          if (messageId && seenMessageIds.has(messageId)) {
            await client.messageFlagsAdd(String(uid), ["\\Seen"]);
            continue;
          }
          if (messageId) seenMessageIds.add(messageId);

          console.log(`[poller] processing mailbox=${mailbox} uid=${uid} from=${fromAddr} subject=${parsed.subject ?? "(no subject)"}`);

          const result = await processInboundEmail({
            fromEmail: fromAddr,
            fromName: parsed.from?.value?.[0]?.name,
            subject: parsed.subject ?? "(no subject)",
            body: (parsed.text ?? "").trim() || "(empty body)",
          });

          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
          console.log(`[poller] ${fromAddr} → ${result.action} NX-${result.ticketNumber} (${mailbox})`);
          handled++;
        } catch (e) {
          console.error(`[poller] failed on message ${uid} in ${mailbox}`, e);
        }
      }
    } finally {
      lock.release();
    }
  }

  return handled;
}

async function main() {
  const once = process.argv.includes("--once");
  const debugMailboxes = process.argv.includes("--debug-mailboxes");
  const debugMessages = process.argv.includes("--debug-messages");
  const client = new ImapFlow({
    host: required("IMAP_HOST"),
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user: required("IMAP_USER"), pass: required("IMAP_PASS") },
    logger: false,
  });
  client.on("error", (error) => {
    console.error("[poller] IMAP connection error", error);
  });

  await client.connect();
  console.log(`[poller] connected to ${process.env.IMAP_HOST} (mailbox: ${process.env.IMAP_MAILBOX ?? "INBOX"})`);

  if (debugMailboxes) {
    await debugMailboxSummary(client);
    await client.logout();
    process.exit(0);
  }

  if (debugMessages) {
    await debugVisibleMessages(client);
    await client.logout();
    process.exit(0);
  }

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
