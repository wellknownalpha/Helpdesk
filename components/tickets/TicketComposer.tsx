"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTicketSchema, type CreateTicketInput } from "@/lib/validations";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TicketComposer({ defaultValues }: { defaultValues?: Partial<CreateTicketInput> }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { priority: "MEDIUM", type: "INCIDENT", tags: [], ...defaultValues },
  });

  async function onSubmit(values: CreateTicketInput) {
    setError("");
    const res = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (!res.ok) { setError("Failed to create ticket"); return; }
    const { data } = await res.json();
    router.push(`/tickets/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label>Subject</Label>
        <Input {...register("subject")} placeholder="Brief summary of the issue" />
        {errors.subject && <p className="text-sm text-red-600">{errors.subject.message}</p>}
      </div>
      <div>
        <Label>Description</Label>
        <Textarea {...register("description")} rows={5} placeholder="Steps to reproduce, impact, environment..." />
        {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Priority</Label>
          <Select value={watch("priority")} onValueChange={(v) => setValue("priority", v as never)}>
            <SelectTrigger><span>{watch("priority")}</span></SelectTrigger>
            <SelectContent>
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Type</Label>
          <Select value={watch("type")} onValueChange={(v) => setValue("type", v as never)}>
            <SelectTrigger><span>{watch("type")}</span></SelectTrigger>
            <SelectContent>
              {["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE_REQUEST", "QUESTION"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create ticket"}</Button>
    </form>
  );
}
