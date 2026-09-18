#!/bin/bash
# Demo the email→ticket loop locally (no real mailbox needed):
# simulates an inbound email via the webhook, then shows the acknowledgement
# email caught by MailHog. Requires the stack running (docker compose up -d).
set -e
APP="${APP_URL:-http://localhost:3002}"

echo "--- 1) Inbound email arrives (simulated via webhook) ---"
curl -s -X POST "$APP/api/webhooks/email" -H "Content-Type: application/json" \
  -d '{"from":"demo-customer@example.com","subject":"Printer on floor 3 is jammed again","body":"Hi, the printer keeps jamming every morning. Please help — urgent for payroll printing."}'
echo; echo
sleep 2
echo "--- 2) Acknowledgement email caught by MailHog ---"
curl -s "http://localhost:8025/api/v2/messages" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
for m in items[:3]:
    h = m['Content']['Headers']
    print('To     :', h.get('To'), '| Subject:', h.get('Subject'))
print(f'({len(items)} message(s) total in MailHog — open http://localhost:8025 to read them)')
"
echo
echo "--- 3) Now reply / comment / close the ticket in the UI and watch new emails land in MailHog ---"
