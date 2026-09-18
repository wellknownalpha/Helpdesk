import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      destructive: "border-transparent bg-destructive text-destructive-foreground",
      outline: "text-foreground",
      success: "border-transparent bg-green-600 text-white",
      warning: "border-transparent bg-amber-500 text-white",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };

export function PriorityBadge({ priority }: { priority: string }) {
  const v = priority === "URGENT" ? "destructive" : priority === "HIGH" ? "warning" : priority === "MEDIUM" ? "default" : "secondary";
  return <Badge variant={v as never}>{priority}</Badge>;
}
export function StatusBadge({ status }: { status: string }) {
  const v = status === "CLOSED" || status === "RESOLVED" ? "success" : status === "NEW" ? "secondary" : status === "PENDING" ? "warning" : "default";
  return <Badge variant={v as never}>{status.replace("_", " ")}</Badge>;
}
