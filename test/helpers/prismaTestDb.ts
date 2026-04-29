import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../src/lib/prismaClient";
import { seedDemoUsers } from "../../src/auth/PrismaUserRepository";

export interface PrismaTestDb {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
  /** Wipe events and rsvps between tests; demo users are preserved. */
  clearEventData: () => Promise<void>;
  /**
   * Insert a non-demo user (e.g., an "other" organizer used by tests that
   * exercise the not-the-acting-user case). Idempotent via upsert so tests
   * that share a DB across cases don't collide.
   */
  seedUser: (id: string, role?: string) => Promise<void>;
}

/**
 * Spin up a fresh SQLite database in a temp directory, push the Prisma schema
 * to it, and seed the demo users. Each call gets an isolated database so suites
 * can run in parallel without stepping on each other.
 */
export async function setupPrismaTestDb(): Promise<PrismaTestDb> {
  const tmp = mkdtempSync(join(tmpdir(), "ttb-prisma-"));
  const dbPath = join(tmp, "test.db");
  const url = `file:${dbPath}`;

  execSync(`npx prisma db push --accept-data-loss`, {
    env: { ...process.env, DATABASE_URL: url },
    cwd: process.cwd(),
    stdio: "ignore",
  });

  const prisma = createPrismaClient(url);
  await seedDemoUsers(prisma);

  return {
    prisma,
    async cleanup() {
      await prisma.$disconnect();
      rmSync(tmp, { recursive: true, force: true });
    },
    async clearEventData() {
      await prisma.rsvp.deleteMany({});
      await prisma.event.deleteMany({});
    },
    async seedUser(id, role = "user") {
      await prisma.user.upsert({
        where: { id },
        update: {},
        create: {
          id,
          email: `${id}@test.local`,
          displayName: id,
          role,
          passwordHash: "test-hash",
        },
      });
    },
  };
}
