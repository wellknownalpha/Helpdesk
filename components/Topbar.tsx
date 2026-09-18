"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar({ role, name, email }: { role: string; name: string; email: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background/90 px-4 py-2.5 backdrop-blur md:px-8">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex w-full max-w-md items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search or jump to...</span>
          <kbd className="rounded border bg-background px-1.5 text-xs">Ctrl K</kbd>
        </button>
        <span className="ml-auto hidden items-center gap-2 text-sm sm:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <span className="leading-tight">
            <span className="block font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground">{role}</span>
          </span>
        </span>
        <span className="hidden text-xs text-muted-foreground lg:block">{email}</span>
        <ThemeToggle />
      </div>
      <CommandPalette role={role} open={paletteOpen} setOpen={setPaletteOpen} />
    </>
  );
}
