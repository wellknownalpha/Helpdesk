import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { processInboundEmail } from "../lib/email/inbound";

const POLL_SECONDS = Number(process.env.IMAP_POLL_SECONDS ?? 60);
const MAX_MESSAGES_PER_FOLDER = Number(process.env.IMAP_MAX_MESSAGES_PER_FOLDER ?? 100);
const LOOKBACK_DAYS = Number(process.env.IMAP_LOOKBACK_DAYS ?? 7);

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

async function getMailboxCandidates(client: ImapFlow): Promise<string[]> {
  const mailboxes = await client.list();
  const candidates = new Set<string>();
  for (const box of mailboxes) {
    const path = (box as { path?: string }).path ?? (box as { name?: string }).name ?? "";
    const special = (box as { specialUse?: string }).specialUse ?? "";
    const normalized = path.trim().replace(/^"|"$/g, "");
    if (!normalized) continue;
    const upper = normalized.toUpperCase();
    if (upper === "[GMAIL]" || upper.includes("STARRED") || upper.includes("SENT") || upper.includes("DRAFT") || upper.includes("TRASH") || upper.includes("SPAM") || upper.includes("JUNK") || upper.includes("IMPORTANT") || ["\\SENT", "\\DRAFTS", "\\TRASH", "\\JUNK", "\\FLAGGED"].includes(special)) continue;
    if (upper === "INBOX") candidates.add("INBOX");
    else if (normalized.includes("/") || normalized.includes(" ")) candidates.add(normalized);
  }
  if (candidates.size === 0) candidates.add(process.env.IMAP_MAILBOX ?? "INBOX");
  return Array.from(candidates);
}

async function pollOnce(client: ImapFlow): Promise<number> {
  const mailboxes = await getMailboxCandidates(client);
  const seenMessageIds = new Set<string>();
  let handled = 0;
  for (const mailbox of mailboxes) {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const unreadUids = await client.search({ seen: false, since });
      const uids = (Array.isArray(unreadUids) ? unreadUids : []).slice(-MAX_MESSAGES_PER_FOLDER);
      for (const uid of uids) {
        try {
          const fetched = await client.fetchOne(String(uid), { source: true });
          const raw = fetched && (fetched as { source?: Buffer }).source;
          if (!raw) continue;
          const parsed = await simpleParser(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)));
          const fromAddr = parsed.from?.value?.[0]?.address;
          if (!fromAddr || !isAddressedToMailbox(parsed)) continue;
          const messageId = (parsed.headerLines.find((header) => header.key.toLowerCase() === "message-id")?.line ?? "").trim();
          if (messageId && seenMessageIds.has(messageId)) {
            await client.messageFlagsAdd(String(uid), ["\\Seen"]);
            continue;
          }
          if (messageId) seenMessageIds.add(messageId);
          const result = await processInboundEmail({ fromEmail: fromAddr, fromName: parsed.from?.value?.[0]?.name, subject: parsed.subject ?? "(no subject)", body: (parsed.text ?? "").trim() || "(empty body)" });
          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
          console.log(`[poller] ${fromAddr} -> ${result.action} EXC-${result.ticketNumber} (${mailbox})`);
          handled++;
        } catch (error) {
          console.error(`[poller] failed on message ${uid} in ${mailbox}`, error);
        }
      }
    } finally {
      lock.release();
    }
  }
  return handled;
}

async function main() {
  const client = new ImapFlow({ host: required("IMAP_HOST"), port: Number(process.env.IMAP_PORT ?? 993), secure: process.env.IMAP_SECURE !== "false", auth: { user: required("IMAP_USER"), pass: required("IMAP_PASS") }, logger: false });
  client.on("error", (error) => console.error("[poller] IMAP connection error", error));
  await client.connect();
  console.log(`[poller] connected to ${process.env.IMAP_HOST}`);
  for (;;) {
    try {
      const handled = await pollOnce(client);
      if (handled > 0) console.log(`[poller] cycle handled ${handled} message(s)`);
    } catch (error) {
      console.error("[poller] cycle failed, will retry", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
  }
}

main().catch((error) => { console.error("[poller] fatal", error); process.exit(1); });
