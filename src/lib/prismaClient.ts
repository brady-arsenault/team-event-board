import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Construct a {@link PrismaClient} backed by the better-sqlite3 driver adapter.
 *
 * Prisma v7 requires a driver adapter; the schema's `provider = "sqlite"` only
 * tells the migration engine which dialect to emit. Runtime queries go through
 * whatever adapter is wired here.
 *
 * @param url SQLite URL — `file:./prisma/dev.db` for local dev, `:memory:` for
 *            isolated tests, or any other file path. Defaults to the
 *            `DATABASE_URL` env var.
 */
export function createPrismaClient(
  url: string = process.env.DATABASE_URL ?? "file:./prisma/dev.db",
): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}
