import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { processInboundEmail } from "../lib/email/inbound";
import { db } from "../lib/db/prisma";

const RECOVERY_SCAN_MS = Number(process.env.IMAP_RECOVERY_SCAN_MS ?? 2000);
const MAX_MESSAGES_PER_FOLDER = Number(process.env.IMAP_MAX_MESSAGES_PER_FOLDER ?? 100);
const RECONNECT_MAX_MS = 10_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function isAddressedToMailbox(parsed: Awaited<ReturnType<typeof simpleParser>>): boolean {
  const mailbox = process.env.IMAP_USER?.toLowerCase().trim();
  if (!mailbox) return true;
  const addresses = (field: typeof parsed.to) => Array.isArray(field) ? field : field?.value ?? [];
  const recipients = [...addresses(parsed.to), ...addresses(parsed.cc), ...addresses(parsed.bcc)];
  const deliveredTo = parsed.headers.get("delivered-to");
  const recipientAddresses = recipients.flatMap((recipient) => {
    if ("address" in recipient) return recipient.address ? [recipient.address] : [];
    if ("value" in recipient) return recipient.value.map((value) => value.address).filter((value): value is string => Boolean(value));
    return [];
  });
  return recipientAddresses.some((address) => address.toLowerCase() === mailbox) || (typeof deliveredTo === "string" && deliveredTo.toLowerCase().includes(mailbox));
}

function getRecipientEmails(parsed: Awaited<ReturnType<typeof simpleParser>>): string[] {
  const addresses = (field: typeof parsed.to) => Array.isArray(field) ? field : field?.value ?? [];
  return [...addresses(parsed.to), ...addresses(parsed.cc), ...addresses(parsed.bcc)].flatMap((recipient) => {
    if ("address" in recipient) return recipient.address ? [recipient.address] : [];
    if ("value" in recipient) return recipient.value.map((value) => value.address).filter((value): value is string => Boolean(value));
    return [];
  });
}

async function processMessage(client: ImapFlow, uid: number, mailbox: string): Promise<void> {
  const fetched = await client.fetchOne(String(uid), { source: true }, { uid: true });
  const raw = fetched && (fetched as { source?: Buffer }).source;
  if (!raw) throw new Error(`Message source unavailable for UID ${uid}`);

  const parsed = await simpleParser(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)));
  const fromAddr = parsed.from?.value?.[0]?.address;
  if (!fromAddr || !isAddressedToMailbox(parsed)) {
    await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    console.log(`[poller] ignored UID ${uid}: missing sender or not addressed to IMAP_USER`);
    return;
  }

  const result = await processInboundEmail({
    fromEmail: fromAddr,
    fromName: parsed.from?.value?.[0]?.name,
    subject: parsed.subject ?? "(no subject)",
    body: (parsed.text ?? "").trim() || "(empty body)",
    recipientEmails: getRecipientEmails(parsed),
    messageId: parsed.messageId?.trim() || undefined,
  });
  await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
  console.log(`[poller] ${fromAddr} -> ${result.action} EXC-${result.ticketNumber} (${mailbox}, UID ${uid})`);
}

function waitForMailboxChange(client: ImapFlow, mailbox: string): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      client.off("exists", onExists);
      client.off("close", onClose);
      resolve();
    };
    const onExists = (event: { path: string }) => {
      if (event.path === mailbox) finish();
    };
    const onClose = () => finish();
    const timer = setTimeout(finish, RECOVERY_SCAN_MS);
    client.on("exists", onExists);
    client.once("close", onClose);
  });
}

async function runConnection(): Promise<void> {
  const host = required("IMAP_HOST");
  const mailbox = process.env.IMAP_MAILBOX?.trim() || "INBOX";
  const client = new ImapFlow({
    host,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user: required("IMAP_USER"), pass: required("IMAP_PASS") },
    logger: false,
  });
  client.on("error", (error) => console.error("[poller] IMAP connection error", error));

  try {
    await client.connect();
    const opened = await client.mailboxOpen(mailbox);
    const savedCursor = await db.inboundMailboxCursor.findUnique({ where: { mailbox } });
    let lastUid = savedCursor?.uidValidity === opened.uidValidity
      ? savedCursor.lastUid
      : Math.max(0, opened.uidNext - 1);
    if (!savedCursor || savedCursor.uidValidity !== opened.uidValidity) {
      await db.inboundMailboxCursor.upsert({
        where: { mailbox },
        create: { mailbox, uidValidity: opened.uidValidity, lastUid },
        update: { uidValidity: opened.uidValidity, lastUid },
      });
    }
    console.log(`[poller] connected to ${host}`);
    console.log(`[poller] watching ${mailbox} with IMAP IDLE and ${RECOVERY_SCAN_MS}ms recovery scan from UID ${lastUid + 1}`);

    for (;;) {
      await waitForMailboxChange(client, mailbox);
      if (!client.usable) throw new Error("IMAP connection closed");

      const newUids = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      const uids = (Array.isArray(newUids) ? newUids : []).slice(0, MAX_MESSAGES_PER_FOLDER);
      for (const uid of uids) {
        try {
          await processMessage(client, uid, mailbox);
          lastUid = uid;
          await db.inboundMailboxCursor.update({ where: { mailbox }, data: { lastUid } });
        } catch (error) {
          console.error(`[poller] failed on new UID ${uid}; will retry`, error);
          break;
        }
      }
    }
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
}

async function main() {
  let retryMs = 1000;
  for (;;) {
    try {
      await runConnection();
      retryMs = 1000;
    } catch (error) {
      console.error(`[poller] IMAP session ended; reconnecting in ${retryMs}ms`, error);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
    }
  }
}

main().catch((error) => { console.error("[poller] fatal", error); process.exit(1); });
