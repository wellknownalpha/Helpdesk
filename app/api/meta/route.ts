import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireSession, authErrorResponse } from "@/lib/auth/helpers";

export async function GET() {
  try {
    const user = await requireSession();
    if (!["TEAM_LEAD", "ADMIN", "AGENT"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const [teams, departments, agents] = await Promise.all([
      db.team.findMany({ include: { members: { select: { id: true, name: true, email: true, role: true } } } }),
      db.department.findMany(),
      db.user.findMany({ where: { role: { in: ["AGENT", "TEAM_LEAD"] }, isActive: true }, select: { id: true, name: true, email: true, teamId: true } }),
    ]);
    return NextResponse.json({ data: { teams, departments, agents } });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
