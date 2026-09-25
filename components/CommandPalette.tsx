"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Ticket, Plus, LayoutDashboard, BookOpen, Package, CheckSquare, BarChart3, Users, ShieldCheck, LogOut } from "lucide-react";

type Item = { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

export function CommandPalette({ role, open, setOpen }: { role: string; open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tickets, setTickets] = useState<{ id: string; ticketNumber: number; subject: string; status: string }[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(!openRef.current); }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) { setQ(""); setTickets([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open ]);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setTickets([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tickets?${new URLSearchParams({ q: q.trim(), pageSize: "6" })}`);
        const d = await res.json();
        setTickets(d.data ?? []);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  function go(href: string) {
    return () => { setOpen(false); router.push(href); };
  }

  const nav: Item[] = [
    { id: "dash", group: "Go to", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, run: go("/dashboard") },
    { id: "tickets", group: "Go to", label: "Tickets", icon: <Ticket className="h-4 w-4" />, run: go("/tickets") },
    { id: "new", group: "Create", label: "New ticket", icon: <Plus className="h-4 w-4" />, run: go("/tickets/new") },
    { id: "kb", group: "Go to", label: "Knowledge base", icon: <BookOpen className="h-4 w-4" />, run: go("/knowledge") },
    { id: "catalog", group: "Go to", label: "Service catalog", icon: <Package className="h-4 w-4" />, run: go("/catalog") },
    { id: "approvals", group: "Go to", label: "Approvals", icon: <CheckSquare className="h-4 w-4" />, run: go("/approvals") },
    ...(role !== "REQUESTER" ? [{ id: "reports", group: "Go to", label: "Reports", icon: <BarChart3 className="h-4 w-4" />, run: go("/reports") } as Item] : []),
    ...(["TEAM_LEAD", "ADMIN"].includes(role) ? [{ id: "team", group: "Go to", label: "Team", icon: <Users className="h-4 w-4" />, run: go("/team") } as Item] : []),
    ...(role === "ADMIN" ? [{ id: "admin", group: "Go to", label: "Administration", icon: <ShieldCheck className="h-4 w-4" />, run: go("/admin") } as Item] : []),
  ];

  const filtered = nav.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase()));
  const ticketItems: Item[] = tickets.map((t) => ({
    id: t.id, group: "Tickets", label: `EXC-${t.ticketNumber} — ${t.subject}`, hint: t.status,
    icon: <Ticket className="h-4 w-4" />, run: go(`/tickets/${t.id}`),
  }));
  const all = [...filtered, ...ticketItems];

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, all.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && all[active]) { setOpen(false); all[active].run(); }
  }

  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown} placeholder="Search tickets, or jump to a page..."
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 text-xs text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-80 overflow-auto p-2">
          {all.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{header}</p>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { setOpen(false); item.run(); }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${i === active ? "bg-accent" : ""}`}
                >
                  {item.icon}<span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
                </button>
              </div>
            );
          })}
          {all.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No results. Try a ticket subject or page name.</p>}
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>↑↓ navigate</span><span>↵ open</span>
          <button className="ml-auto flex items-center gap-1 hover:text-foreground" onClick={() => { setOpen(false); import("next-auth/react").then(({ signOut }) => signOut({ callbackUrl: "/login" })); }}>
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
