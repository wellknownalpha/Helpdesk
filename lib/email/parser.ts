export interface ParsedEmail {
  from: string;
  subject: string;
  body: string;
  messageId?: string;
}

/** Parse a raw inbound email (headers + body) into a ticket draft. */
export function parseInboundEmail(raw: string): ParsedEmail {
  const lines = raw.split(/\r?\n/);
  let from = "unknown@example.com";
  let subject = "(no subject)";
  const bodyLines: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (!inBody) {
      if (line === "") { inBody = true; continue; }
      const mFrom = line.match(/^From:\s*(.+)/i);
      const mSubj = line.match(/^Subject:\s*(.+)/i);
      if (mFrom) from = mFrom[1].replace(/[<>"']/g, "").trim();
      if (mSubj) subject = mSubj[1].trim();
    } else {
      bodyLines.push(line);
    }
  }
  return { from, subject, body: bodyLines.join("\n").trim() || "(empty body)" };
}

/** Extract priority hints from email body, e.g. "[urgent]". */
export function detectPriority(text: string): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  const t = text.toLowerCase();
  if (t.includes("urgent") || t.includes("outage") || t.includes("down")) return "URGENT";
  if (t.includes("high") || t.includes("blocked") || t.includes("asap")) return "HIGH";
  if (t.includes("low") || t.includes("minor") || t.includes("whenever")) return "LOW";
  return "MEDIUM";
}
