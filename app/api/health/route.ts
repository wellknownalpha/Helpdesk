import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";

// Public liveness probe for Docker / load balancers. No auth.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "excldesk", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
