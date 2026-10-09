"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
    setTokenLoaded(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "This reset link is invalid or expired.");
        return;
      }
      setIsComplete(true);
      setMessage(result.message);
    } catch {
      setMessage("Could not contact the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {!tokenLoaded && <p role="status" className="text-sm text-muted-foreground">Loading reset link...</p>}
      {tokenLoaded && !token && <p role="status" className="text-sm text-muted-foreground">Reset token is missing. Request a new password reset link.</p>}
      {!isComplete && <>
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </div>
        <Button className="w-full" type="submit" disabled={!token || isSubmitting}>{isSubmitting ? "Updating..." : "Reset password"}</Button>
      </>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <Link href="/login" className="text-sm text-primary hover:underline">Back to login</Link>
    </form>
  );
}
