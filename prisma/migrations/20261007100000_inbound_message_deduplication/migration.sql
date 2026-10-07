ALTER TABLE "Ticket" ADD COLUMN "inboundMessageId" TEXT;
ALTER TABLE "TicketComment" ADD COLUMN "inboundMessageId" TEXT;

CREATE UNIQUE INDEX "Ticket_inboundMessageId_key" ON "Ticket"("inboundMessageId");
CREATE UNIQUE INDEX "TicketComment_inboundMessageId_key" ON "TicketComment"("inboundMessageId");
