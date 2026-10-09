import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { processInboundEmail } from "../lib/email/inbound";
import { db } from "../lib/db/prisma";

const RECOVERY_SCAN_MS = Number(process.env.IMAP_RECOVERY_SCAN_MS ?? 1000);
const MAX_MESSAGES_PER_FOLDER = Number(process.env.IMAP_MAX_MESSAGES_PER_FOLDER ?? 100);
const IMAP_SEARCH_TIMEOUT_MS = Number(process.env.IMAP_SEARCH_TIMEOUT_MS ?? 15_000);
const IMAP_HEALTH_LOG_INTERVAL_MS = Number(process.env.IMAP_HEALTH_LOG_INTERVAL_MS ?? 60_000);
const IMAP_MAX_CONNECTION_AGE_MS = Number(process.env.IMAP_MAX_CONNECTION_AGE_MS ?? 300_000);
const RECONNECT_MAX_MS = 10_000;

if (!Number.isFinite(IMAP_SEARCH_TIMEOUT_MS) || IMAP_SEARCH_TIMEOUT_MS <= 0) {
  throw new Error("IMAP_SEARCH_TIMEOUT_MS must be a positive number");
}

if (!Number.isFinite(IMAP_HEALTH_LOG_INTERVAL_MS) || IMAP_HEALTH_LOG_INTERVAL_MS <= 0) {
  throw new Error("IMAP_HEALTH_LOG_INTERVAL_MS must be a positive number");
}

if (!Number.isFinite(IMAP_MAX_CONNECTION_AGE_MS) || IMAP_MAX_CONNECTION_AGE_MS <= 0) {
  throw new Error("IMAP_MAX_CONNECTION_AGE_MS must be a positive number");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function getAccountKey(host: string, port: number, secure: boolean, user: string): string {
  return createHash("sha256")
    .update([host.trim().toLowerCase(), port, secure, user.trim().toLowerCase()].join("\0"))
    .digest("hex");
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
  const fromAddr = parsed.from?.value?.[0]?.address
    ?? parsed.replyTo?.value?.[0]?.address
    ?? `unknown-sender+${uid}@invalid.local`;

  const result = await processInboundEmail({
    fromEmail: fromAddr,
    fromName: parsed.from?.value?.[0]?.name,
    subject: parsed.subject ?? "(no subject)",
    body: (parsed.text ?? "").trim(),
    htmlBody: typeof parsed.html === "string" ? parsed.html : undefined,
    recipientEmails: getRecipientEmails(parsed),
    messageId: parsed.messageId?.trim() || undefined,
  });
  await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
  console.log(`[poller] ${fromAddr} -> ${result.action} EXC-${result.ticketNumber} (${mailbox}, UID ${uid})`);
}

async function runConnection(): Promise<void> {
  const host = required("IMAP_HOST");
  const port = Number(process.env.IMAP_PORT ?? 993);
  const secure = process.env.IMAP_SECURE !== "false";
  const user = required("IMAP_USER");
  const mailboxes = [...new Set((process.env.IMAP_MAILBOXES ?? process.env.IMAP_MAILBOX ?? "INBOX,[Gmail]/Spam")
    .split(",")
    .map((mailbox) => mailbox.trim())
    .filter(Boolean))];
  if (mailboxes.length === 0) throw new Error("At least one IMAP mailbox must be configured");
  const accountKey = getAccountKey(host, port, secure, user);
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass: required("IMAP_PASS") },
    connectionTimeout: IMAP_SEARCH_TIMEOUT_MS,
    socketTimeout: IMAP_SEARCH_TIMEOUT_MS * 2,
    logger: false,
  });
  client.on("error", (error) => console.error("[poller] IMAP connection error", error));

  try {
    await client.connect();
    const connectedAt = Date.now();
    const mailboxStates = [];
    for (const mailbox of mailboxes) {
      const opened = await client.mailboxOpen(mailbox);
      const cursorWhere = { accountKey_mailbox: { accountKey, mailbox } };
      const savedCursor = await db.inboundMailboxCursor.findUnique({ where: cursorWhere });
      const legacyCursor = savedCursor ? null : await db.inboundMailboxCursor.findUnique({
        where: { accountKey_mailbox: { accountKey: "legacy", mailbox } },
      });
      const legacyCursorIsValid = legacyCursor?.uidValidity === opened.uidValidity
        && legacyCursor.lastUid < opened.uidNext;
      const cursorToResume = savedCursor ?? (legacyCursorIsValid ? legacyCursor : null);
      const cursorIsValid = cursorToResume?.uidValidity === opened.uidValidity
        && cursorToResume.lastUid < opened.uidNext;
      let lastUid = cursorIsValid
        ? cursorToResume.lastUid
        : Math.max(0, opened.uidNext - 1);
      if (legacyCursorIsValid && !savedCursor) {
        console.log(`[poller] adopting legacy cursor for ${mailbox} at UID ${lastUid}`);
      }
      if ((savedCursor || legacyCursor) && !cursorIsValid) {
        const previousCursor = savedCursor ?? legacyCursor;
        const reason = !previousCursor
          ? "saved cursor unavailable"
          : previousCursor.uidValidity !== opened.uidValidity
            ? "UIDVALIDITY changed"
            : `saved UID ${previousCursor.lastUid} is beyond UIDNEXT ${opened.uidNext}`;
        console.warn(`[poller] cursor mismatch for ${mailbox} (${reason}); recovering unread messages before UID ${lastUid + 1}`);
      }
      if (!cursorIsValid) {
        let moreUnread = true;
        while (moreUnread) {
          const pendingUids = await client.search({ seen: false }, { uid: true });
          const unreadUids = (Array.isArray(pendingUids) ? pendingUids : [])
            .filter((uid) => uid < opened.uidNext)
            .slice(0, MAX_MESSAGES_PER_FOLDER);
          moreUnread = unreadUids.length === MAX_MESSAGES_PER_FOLDER;
          for (const uid of unreadUids) {
            await processMessage(client, uid, mailbox);
          }
        }
      }
      if (!cursorIsValid) {
        await db.inboundMailboxCursor.upsert({
          where: cursorWhere,
          create: { accountKey, mailbox, uidValidity: opened.uidValidity, lastUid },
          update: { uidValidity: opened.uidValidity, lastUid },
        });
      }
      mailboxStates.push({ mailbox, uidValidity: opened.uidValidity, cursorWhere, lastUid });
    }
    console.log(`[poller] connected to ${host}`);
    console.log(`[poller] watching ${mailboxes.join(", ")} with ${RECOVERY_SCAN_MS}ms UID scan`);

    let lastHealthLogAt = 0;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, RECOVERY_SCAN_MS));
      if (!client.usable) throw new Error("IMAP connection closed");
      if (Date.now() - connectedAt >= IMAP_MAX_CONNECTION_AGE_MS) {
        console.warn(`[poller] recycling IMAP session after ${Date.now() - connectedAt}ms to refresh mailbox state`);
        return;
      }

      const scanStartedAt = new Date();
      const scanStartedMs = scanStartedAt.getTime();
      const logHealth = scanStartedMs - lastHealthLogAt >= IMAP_HEALTH_LOG_INTERVAL_MS;
      if (logHealth) {
        const cursors = mailboxStates.map((state) => `${state.mailbox}:${state.lastUid}`).join(",");
        console.log(`[poller] scan started at=${scanStartedAt.toISOString()} cursors=${cursors}`);
        lastHealthLogAt = scanStartedMs;
      }

      for (const state of mailboxStates) {
        const opened = await client.mailboxOpen(state.mailbox);
        if (opened.uidValidity !== state.uidValidity) {
          throw new Error(`UIDVALIDITY changed for ${state.mailbox}; restarting mailbox recovery`);
        }
        let searchTimeout: NodeJS.Timeout | undefined;
        let newUids: false | number[] | undefined;
        try {
          newUids = await Promise.race([
            client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true }),
            new Promise<never>((_resolve, reject) => {
              searchTimeout = setTimeout(() => {
                const timedOutAt = new Date();
                const error = new Error(`IMAP UID search timed out after ${IMAP_SEARCH_TIMEOUT_MS}ms`);
                console.error(`[poller] scan stalled mailbox=${state.mailbox} startedAt=${scanStartedAt.toISOString()} timedOutAt=${timedOutAt.toISOString()}; closing connection`);
                reject(error);
                client.close();
              }, IMAP_SEARCH_TIMEOUT_MS);
            }),
          ]);
        } finally {
          if (searchTimeout) clearTimeout(searchTimeout);
        }

        const uids = (Array.isArray(newUids) ? newUids : [])
          .filter((uid) => uid > state.lastUid)
          .slice(0, MAX_MESSAGES_PER_FOLDER);
        const scanCompletedAt = new Date();
        if (logHealth || uids.length > 0) {
          console.log(`[poller] scan completed mailbox=${state.mailbox} startedAt=${scanStartedAt.toISOString()} completedAt=${scanCompletedAt.toISOString()} durationMs=${scanCompletedAt.getTime() - scanStartedMs} found=${uids.length}`);
        }
        if (uids.length > 0) console.log(`[poller] catch-up found ${uids.length} new message(s) in ${state.mailbox}`);
        for (const uid of uids) {
          try {
            await processMessage(client, uid, state.mailbox);
            state.lastUid = uid;
            await db.inboundMailboxCursor.upsert({
              where: state.cursorWhere,
              create: {
                accountKey,
                mailbox: state.mailbox,
                uidValidity: state.uidValidity,
                lastUid: state.lastUid,
              },
              update: { lastUid: state.lastUid },
            });
          } catch (error) {
            console.error(`[poller] failed on new UID ${uid} in ${state.mailbox}; will retry`, error);
            break;
          }
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
