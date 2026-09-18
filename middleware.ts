import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";
import { hasRole } from "@/lib/auth/rbac";
import type { Role } from "@prisma/client";

// Edge-safe: authConfig never touches Prisma (see lib/auth/auth.config.ts).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  // Public: auth pages, auth API, health probe, and the inbound-email webhook
  // (webhook enforces its own INBOUND_WEBHOOK_SECRET when configured).
  const publicPaths = ["/login", "/forgot-password", "/reset-password", "/api/auth", "/api/health", "/api/webhooks/"];
  if (pathname === "/") return NextResponse.next();
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return NextResponse.next();

  const user = req.auth?.user as unknown as { role?: Role } | undefined;
  if (!user?.role) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = user.role;
  if (pathname.startsWith("/admin") && !hasRole(role, "ADMIN")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  if ((pathname.startsWith("/reports") || pathname.startsWith("/team")) && !hasRole(role, "AGENT")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"] };
