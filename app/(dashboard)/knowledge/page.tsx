"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function KnowledgePage() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["kb", q],
    queryFn: async () => {
      const res = await fetch(`/api/kb?${new URLSearchParams({ q })}`);
      return res.json();
    },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Knowledge Base</h1>
      <Input placeholder="Search articles..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
      <div className="grid gap-4 md:grid-cols-2">
        {(data?.data ?? []).map((a: { id: string; title: string; category: string; views: number; content: string }) => (
          <Card key={a.id}>
            <CardHeader><CardTitle className="text-base">{a.title}</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-muted-foreground">{a.category} · {a.views} views</p>
              <p className="line-clamp-3 text-sm">{a.content}</p>
              <Link href={`/knowledge/${a.id}`} className="mt-2 inline-block text-sm text-primary hover:underline">Read more</Link>
            </CardContent>
          </Card>
        ))}
      </div>
      {(data?.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No articles found.</p>}
    </div>
  );
}
