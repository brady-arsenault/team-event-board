import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrismaClient } from "../../src/lib/prismaClient";
import { CreatePrismaEventRepository } from "../../src/repository/PrismaEventRepository";
import { CreateEventService } from "../../src/service";
import { silentLogger } from "../helpers/buildTestApp";
import type { IEvent } from "../../src/contracts";

/**
 * Sprint 3 smoke test: verifies the Feature 2 visibility rule still holds
 * when EventService is backed by PrismaEventRepository against a real SQLite
 * database (not a mock or in-memory array).
 */
describe("Feature 2 visibility rule (Prisma-backed)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "feat2-prisma-"));
  const dbPath = join(tmp, "test.db");
  const url = `file:${dbPath}`;
  const prisma = createPrismaClient(url);

  beforeAll(() => {
    execSync(`npx prisma db push --accept-data-loss`, {
      env: { ...process.env, DATABASE_URL: url },
      cwd: process.cwd(),
      stdio: "ignore",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(tmp, { recursive: true, force: true });
  });

  async function seedUser(id: string, role: string) {
    await prisma.user.create({
      data: {
        id,
        email: `${id}@example.com`,
        displayName: id,
        role,
        passwordHash: "x",
      },
    });
  }

  async function seedEvent(overrides: Partial<IEvent> & { id: string; organizerId: string; status: IEvent["status"] }) {
    const now = new Date();
    await prisma.event.create({
      data: {
        id: overrides.id,
        title: overrides.title ?? "T",
        description: overrides.description ?? "D",
        location: overrides.location ?? "L",
        category: overrides.category ?? "social",
        capacity: overrides.capacity ?? null,
        status: overrides.status,
        startAt: overrides.startAt ?? new Date(now.getTime() + 86400000),
        endAt: overrides.endAt ?? new Date(now.getTime() + 90000000),
        organizerId: overrides.organizerId,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  it("enforces draft visibility: organizer/admin yes, others no; published visible to all", async () => {
    await seedUser("organizer-1", "staff");
    await seedUser("admin-1", "admin");
    await seedUser("member-1", "user");
    await seedEvent({ id: "evt-draft", organizerId: "organizer-1", status: "draft" });
    await seedEvent({ id: "evt-pub", organizerId: "organizer-1", status: "published" });

    const service = CreateEventService(CreatePrismaEventRepository(prisma), silentLogger());

    const asOrganizer = { userId: "organizer-1", role: "staff" as const, displayName: "o" };
    const asAdmin = { userId: "admin-1", role: "admin" as const, displayName: "a" };
    const asMember = { userId: "member-1", role: "user" as const, displayName: "m" };

    // Draft: organizer + admin can read; non-organizer member cannot.
    expect((await service.getEventById("evt-draft", asOrganizer)).ok).toBe(true);
    expect((await service.getEventById("evt-draft", asAdmin)).ok).toBe(true);
    const blocked = await service.getEventById("evt-draft", asMember);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.value.name).toBe("UnauthorizedError");

    // Published: visible to everyone authenticated.
    expect((await service.getEventById("evt-pub", asOrganizer)).ok).toBe(true);
    expect((await service.getEventById("evt-pub", asAdmin)).ok).toBe(true);
    expect((await service.getEventById("evt-pub", asMember)).ok).toBe(true);

    // Missing event: NotFound regardless of role.
    const missing = await service.getEventById("does-not-exist", asAdmin);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.value.name).toBe("EventNotFoundError");
  });
});
