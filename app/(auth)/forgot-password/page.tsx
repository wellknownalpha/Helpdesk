import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <form className="space-y-4" action="#">
      <div>
        <Label>Work email</Label>
        <Input type="email" placeholder="you@company.com" />
      </div>
      <Button className="w-full" type="submit">Send reset link (mock)</Button>
      <p className="text-xs text-muted-foreground">This demo does not send real email. In production this triggers a signed reset token via the notification service.</p>
      <Link href="/login" className="text-sm text-primary hover:underline">Back to login</Link>
    </form>
  );
}
