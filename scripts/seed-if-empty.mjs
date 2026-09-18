// Runs inside the production container: seeds demo data ONLY when the DB is empty.
// Safe to run on every boot — never duplicates (seed script uses upserts, and we skip when users exist).
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const db = new PrismaClient();
try {
  const users = await db.user.count();
  if (users === 0) {
    console.log("[seed] Empty database — running full seed...");
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  } else {
    console.log(`[seed] Database already has ${users} user(s) — skipping seed.`);
  }
} finally {
  await db.$disconnect();
}
