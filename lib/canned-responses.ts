// Client-safe canned responses (no server imports — safe to bundle in the browser).
export const cannedResponses = [
  { id: "ack", title: "Acknowledgement", body: "Thanks for reaching out — we've received your request and an agent will respond shortly." },
  { id: "need-info", title: "Need more info", body: "Could you please share screenshots and steps to reproduce so we can investigate faster?" },
  { id: "resolved", title: "Resolution confirm", body: "We believe this is now resolved. Please confirm, or reply to reopen within 5 days." },
  { id: "scheduled", title: "Maintenance window", body: "A fix is scheduled in our next maintenance window. We'll update you once deployed." },
];
