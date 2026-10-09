ALTER TABLE "InboundMailboxCursor"
ADD COLUMN "accountKey" TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE "InboundMailboxCursor"
ALTER COLUMN "accountKey" DROP DEFAULT;

ALTER TABLE "InboundMailboxCursor"
DROP CONSTRAINT "InboundMailboxCursor_pkey";

ALTER TABLE "InboundMailboxCursor"
ADD CONSTRAINT "InboundMailboxCursor_pkey" PRIMARY KEY ("accountKey", "mailbox");