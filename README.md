# NexusDesk — original ITSM & Help Desk

Production-quality, ready-to-run IT service management platform: ticketing, knowledge base,
service catalog with approvals, SLA tracking, team analytics, and strict role-based access control.

## Run it (one command, anywhere incl. EC2)

Requirements: Docker + Docker Compose plugin only.

```bash
cp .env.example .env
# REQUIRED: set a strong secret and the public URL in .env:
#   AUTH_SECRET=$(openssl rand -base64 32)
#   APP_URL=http://<your-host-or-ec2-ip>:3002   (AUTH_URL/NEXTAUTH_URL follow APP_URL)

docker compose up -d --build
# → App:      http://<host>:3002
# → Health:   http://<host>:3002/api/health
# → MailHog:  http://<host>:8025   (dev email catcher)
```

On first boot the `app` container automatically: waits for Postgres → applies Prisma
migrations (`migrate deploy`) → seeds demo data **only if the database is empty** → starts
Next.js in production mode. Existing data is never touched on restarts/upgrades.

Demo logins (password `Password123!` — change immediately in Admin → Users):
- `admin@nexusdesk.local` (ADMIN — full access)
- `lead@nexusdesk.local` (TEAM_LEAD)
- `agent@nexusdesk.local` (AGENT)
- `requester@nexusdesk.local` (REQUESTER)

## Feature tour (Linear-grade speed, Freshservice-grade depth)

- **Command palette (`Ctrl/⌘+K`):** instant navigation + live ticket search from anywhere.
- **Tickets:** portal intake, type/status/priority filters, assignment (agent/team/department),
  tags, file attachments (10 MB, persisted volume), internal notes, canned responses,
  merge, full history, SLA breach banners.
- **Admin:** full user CRUD (roles, teams, departments, activation, password reset),
  team & department management, SLA policies, automation rules, audit logs.
- **Self-service:** knowledge base with search + view counts; service catalog with
  manager approval flows; dashboard + reports analytics; dark mode.

## Email in / out (tickets by email + notifications)

- **Email → ticket:** send mail to the support mailbox → ticket created, sender gets an
  **acknowledgement** email. Replies containing `[NX-123]` thread onto that ticket
  (reopening it if resolved) instead of creating duplicates.
- **Notifications:** ticket creation (portal/email/catalog), public comments
  (agent→requester, requester→assignee), status/priority/team changes, assignment,
  and resolve/close — each emails the right person, never the actor about their own action.


```bash
bash scripts/demo-inbound-email.sh   # creates NX ticket + ack → view at http://localhost:8025
# then comment / resolve the ticket in the UI and watch emails land in MailHog
```

Connect a real mailbox (Admin → Email page shows live status + test button):

- **Option A — IMAP poller** (Gmail/Outlook/any provider): create `support@…`
  (Gmail needs an App Password), set `MAIL_INBOUND_ENABLED=true` + `IMAP_*` + `SMTP_*`
  in `.env`, then `docker compose --profile mail up -d`.
- **Option B — provider webhook** (SendGrid/Mailgun/SES): set `INBOUND_WEBHOOK_SECRET`
  and forward inbound mail to `POST /api/webhooks/email` with header `x-webhook-secret`.
- Outbound SMTP is env-driven (`SMTP_HOST/PORT/USER/PASS/FROM`); set
  `NOTIFICATIONS_ENABLED=false` to silence all mail without code changes.

## EC2 replication (no technical complications)

1. Launch EC2 (Amazon Linux 2023 or Ubuntu 22.04+, t3.small+, 30 GB disk). Open **TCP 3002**
   in the Security Group (restrict to office/VPN IPs if possible).
2. `sudo bash scripts/ec2-setup.sh` — installs Docker, prints the remaining steps.
3. Copy the project over (`scp -r` or `git clone`), then:
   ```bash
   cp .env.example .env
   # edit .env: AUTH_SECRET=<openssl rand -base64 32>, APP_URL=http://<EC2-IP>:3002
   docker compose up -d --build
   ```
4. Open `http://<EC2-IP>:3002`, sign in as admin, change all demo passwords.

Updating later: `docker compose up -d --build` (data persists in the `nexusdesk-pgdata` volume).
Backup: `docker exec nexusdesk-postgres pg_dump -U nexusdesk nexusdesk > backup.sql`.

## Local development (without Docker app)

```bash
docker compose up -d postgres mailhog   # DB on localhost:5433
npm install
npx prisma migrate dev
npm run db:seed
npm run dev -- --port 3002
```

## Verify

- `npm test` — Vitest unit tests (RBAC, email parser, SLA, validations)
- `npm run test:e2e` — Playwright specs (needs `npx playwright install`)
- `curl localhost:3002/api/health` → `{"ok":true,...}`

## Architecture

- `app/` — App Router pages + REST API routes (`/api/tickets`, `/api/kb`,
  `/api/service-catalog`, `/api/approvals`, `/api/users`, `/api/sla`, `/api/meta`,
  `/api/audit-logs`, `/api/dashboard/stats`, `/api/webhooks/email`, `/api/health`)
- `components/` — shadcn-style UI (`ui/`), tickets, dashboard charts, admin
- `lib/auth/` — Auth.js v5: `auth.config.ts` (edge-safe, used by middleware) +
  `auth.ts` (Node-only: credential verification, fresh RBAC lookups) + `rbac.ts`
- `lib/services/` — ticket creation w/ SLA, automation rules, notifications/canned responses
- `lib/email/` — SMTP mailer + templates, inbound processor (threading), parser, priority detection
- `prisma/` — schema, migrations, idempotent seed
