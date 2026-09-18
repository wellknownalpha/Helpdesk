import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default function ResetPasswordPage() {
  return (
    <form className="space-y-4" action="#">
      <div>
        <Label>New password</Label>
        <Input type="password" placeholder="••••••••" />
      </div>
      <Button className="w-full" type="submit">Reset password (mock)</Button>
      <Link href="/login" className="text-sm text-primary hover:underline">Back to login</Link>
    </form>
  );
}
