CREATE TABLE "TicketEmailParticipant" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEmailParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketEmailParticipant_ticketId_email_key" ON "TicketEmailParticipant"("ticketId", "email");
CREATE INDEX "TicketEmailParticipant_email_idx" ON "TicketEmailParticipant"("email");

ALTER TABLE "TicketEmailParticipant"
ADD CONSTRAINT "TicketEmailParticipant_ticketId_fkey"
FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
