import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

const prisma = new PrismaClient();
try {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log("[excldesk] Database is empty; running initial seed...");
    const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  } else {
    console.log(`[excldesk] Seed skipped; ${userCount} user(s) already exist.`);
  }
} finally {
  await prisma.$disconnect();
}
