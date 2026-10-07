CREATE TABLE "InboundMailboxCursor" (
    "mailbox" TEXT NOT NULL,
    "uidValidity" BIGINT NOT NULL,
    "lastUid" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMailboxCursor_pkey" PRIMARY KEY ("mailbox")
);
