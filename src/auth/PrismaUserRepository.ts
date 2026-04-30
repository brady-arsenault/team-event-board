import type { PrismaClient } from "@prisma/client";
import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import type { IUserRecord, UserRole } from "./User";
import type { IUserRepository } from "./UserRepository";
import { DEMO_USERS } from "./InMemoryUserRepository";

/**
 * Prisma-backed user repository. Implements the same {@link IUserRepository}
 * Result-returning interface as the in-memory version, so AuthService and
 * AdminUserService are unchanged.
 *
 * The repository is responsible for translating Prisma exceptions into
 * `Err(UnexpectedDependencyError(...))` so callers stay in Result-land.
 */
class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(
    email: string,
  ): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      const row = await this.prisma.user.findUnique({ where: { email } });
      return Ok(row ? toDomain(row) : null);
    } catch (error) {
      return Err(
        UnexpectedDependencyError(
          `Unable to look up user by email: ${describe(error)}`,
        ),
      );
    }
  }

  async findById(
    id: string,
  ): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      const row = await this.prisma.user.findUnique({ where: { id } });
      return Ok(row ? toDomain(row) : null);
    } catch (error) {
      return Err(
        UnexpectedDependencyError(
          `Unable to look up user by id: ${describe(error)}`,
        ),
      );
    }
  }

  async listUsers(): Promise<Result<IUserRecord[], AuthError>> {
    try {
      const rows = await this.prisma.user.findMany();
      return Ok(rows.map(toDomain));
    } catch (error) {
      return Err(
        UnexpectedDependencyError(`Unable to list users: ${describe(error)}`),
      );
    }
  }

  async createUser(
    user: IUserRecord,
  ): Promise<Result<IUserRecord, AuthError>> {
    try {
      const row = await this.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          passwordHash: user.passwordHash,
        },
      });
      return Ok(toDomain(row));
    } catch (error) {
      return Err(
        UnexpectedDependencyError(
          `Unable to create the user: ${describe(error)}`,
        ),
      );
    }
  }

  async deleteUser(id: string): Promise<Result<boolean, AuthError>> {
    try {
      // Prisma throws P2025 if the row doesn't exist; mirror the in-memory
      // contract by translating that into Ok(false).
      const existing = await this.prisma.user.findUnique({ where: { id } });
      if (!existing) return Ok(false);
      await this.prisma.user.delete({ where: { id } });
      return Ok(true);
    } catch (error) {
      return Err(
        UnexpectedDependencyError(
          `Unable to delete the user: ${describe(error)}`,
        ),
      );
    }
  }
}

function toDomain(row: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  passwordHash: string;
}): IUserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserRole,
    passwordHash: row.passwordHash,
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected database error";
}

export function CreatePrismaUserRepository(
  prisma: PrismaClient,
): IUserRepository {
  return new PrismaUserRepository(prisma);
}

/**
 * Idempotently insert the three demo users (admin/staff/user) used by the
 * existing tests and the local-dev login flow. Safe to call on every app
 * start: it skips users that already exist by id.
 *
 * The demo password hashes ship in {@link DEMO_USERS}, so the seed needs no
 * runtime hashing and the demo password (`password123`) keeps working.
 */
export async function seedDemoUsers(prisma: PrismaClient): Promise<void> {
  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        passwordHash: user.passwordHash,
      },
    });
  }
}
