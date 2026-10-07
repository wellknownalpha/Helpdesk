ALTER TABLE "Ticket" ADD COLUMN "emailSubjectKey" TEXT;

WITH ranked_email_tickets AS (
    SELECT
        "id",
        LOWER(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM("subject"), '^((re|fw|fwd):[[:space:]]*)+', '', 'i'), '[[:space:]]+', ' ', 'g')) AS subject_key,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM("subject"), '^((re|fw|fwd):[[:space:]]*)+', '', 'i'), '[[:space:]]+', ' ', 'g'))
            ORDER BY "createdAt", "ticketNumber"
        ) AS subject_rank
    FROM "Ticket"
    WHERE "source" = 'EMAIL'
)
UPDATE "Ticket" AS ticket
SET "emailSubjectKey" = ranked.subject_key
FROM ranked_email_tickets AS ranked
WHERE ticket."id" = ranked."id" AND ranked.subject_rank = 1;

CREATE UNIQUE INDEX "Ticket_emailSubjectKey_key" ON "Ticket"("emailSubjectKey");
