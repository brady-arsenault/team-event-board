import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../src/lib/prismaClient";
import { CreatePrismaEventRepository } from "../../src/repository/PrismaEventRepository";
import { CreatePrismaRsvpRepository } from "../../src/repository/PrismaRsvpRepository";
import { CreateRsvpService } from "../../src/rsvp/RsvpService";
import type { IEvent, IRsvpService } from "../../src/contracts";
import { silentLogger } from "../helpers/buildTestApp";
import { makeActingUser, USER_IDS } from "./helpers/fixtures";

/**
 * Integration tests that exercise Feature 4 against a real Prisma + SQLite
 * stack. Proves the Sprint 3 composition swap actually works end-to-end:
 *   RsvpService → PrismaRsvpRepository → better-sqlite3 → temp .db file
 *
 * The capacity branch in particular relies on `prisma.rsvp.count(...)` being
 * accurate against live data — these tests fail if the SQL or schema drift.
 */
const MIGRATION_SQL = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "..",
    "prisma",
    "migrations",
    "20260428162219_init",
    "migration.sql",
  ),
  "utf8",
);

function applyMigration(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(MIGRATION_SQL);
  db.close();
}

function insertUser(dbPath: string, id: string): void {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO "User" (id, email, displayName, role, passwordHash) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, `${id}@test.local`, id, "user", "x");
  db.close();
}

async function insertEvent(
  prisma: PrismaClient,
  overrides: Partial<IEvent> = {},
): Promise<IEvent> {
  const now = new Date("2026-04-29T12:00:00Z");
  const event: IEvent = {
    id: overrides.id ?? randomUUID(),
    title: "Prisma Integration Event",
    description: "Backed by SQLite",
    location: "Lab",
    category: "social",
    capacity: overrides.capacity ?? 25,
    status: overrides.status ?? "published",
    startAt: overrides.startAt ?? new Date("2099-06-01T18:00:00Z"),
    endAt: overrides.endAt ?? new Date("2099-06-01T20:00:00Z"),
    organizerId: overrides.organizerId ?? USER_IDS.staff,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
  await prisma.event.create({
    data: {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      category: event.category,
      capacity: event.capacity,
      status: event.status,
      startAt: event.startAt,
      endAt: event.endAt,
      organizerId: event.organizerId,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    },
  });
  return event;
}

describe("Feature 4 — toggleRsvp on Prisma + SQLite", () => {
  let dbPath: string;
  let dbUrl: string;
  let prisma: PrismaClient;
  let service: IRsvpService;

  beforeEach(async () => {
    dbPath = path.join(
      os.tmpdir(),
      `rsvp-prisma-${randomUUID()}.db`,
    );
    dbUrl = `file:${dbPath}`;
    applyMigration(dbPath);

    // Seed every user the tests use, since FK constraints are real now.
    for (const id of Object.values(USER_IDS)) insertUser(dbPath, id);

    prisma = createPrismaClient(dbUrl);
    const eventRepo = CreatePrismaEventRepository(prisma);
    const rsvpRepo = CreatePrismaRsvpRepository(prisma);
    service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
  });

  afterEach(async () => {
    await prisma.$disconnect();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("creates a 'going' RSVP and persists it to SQLite", async () => {
    const event = await insertEvent(prisma, { capacity: 10 });

    const result = await service.toggleRsvp(event.id, makeActingUser());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("going");

    const rows = await prisma.rsvp.findMany({ where: { eventId: event.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("going");
    expect(rows[0].userId).toBe(USER_IDS.reader);
  });

  it("waitlists a new RSVP when capacity is full per a live SQL count", async () => {
    const event = await insertEvent(prisma, { capacity: 2 });

    // Fill the event with two other 'going' rows so the count() returns 2.
    await prisma.rsvp.createMany({
      data: [
        {
          id: randomUUID(),
          eventId: event.id,
          userId: USER_IDS.staff,
          status: "going",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: randomUUID(),
          eventId: event.id,
          userId: USER_IDS.admin,
          status: "going",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const result = await service.toggleRsvp(event.id, makeActingUser());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("waitlisted");

    const mine = await prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: USER_IDS.reader } },
    });
    expect(mine?.status).toBe("waitlisted");
  });

  it("toggles an existing 'going' RSVP off ('cancelled') without re-counting capacity", async () => {
    const event = await insertEvent(prisma, { capacity: 10 });
    await service.toggleRsvp(event.id, makeActingUser()); // going

    const result = await service.toggleRsvp(event.id, makeActingUser()); // cancel

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("cancelled");

    const going = await prisma.rsvp.count({
      where: { eventId: event.id, status: "going" },
    });
    expect(going).toBe(0);
  });

  it("re-activating a cancelled RSVP picks 'going' or 'waitlisted' based on the LIVE count", async () => {
    const event = await insertEvent(prisma, { capacity: 1 });

    // Reader RSVPs and then cancels.
    await service.toggleRsvp(event.id, makeActingUser());
    await service.toggleRsvp(event.id, makeActingUser());

    // Meanwhile someone else takes the only seat.
    await prisma.rsvp.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        userId: USER_IDS.staff,
        status: "going",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Reader re-toggles — capacity is now full per a fresh SQL count.
    const result = await service.toggleRsvp(event.id, makeActingUser());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("waitlisted");
  });

  it("rejects RSVPs to a cancelled event", async () => {
    const event = await insertEvent(prisma, { status: "cancelled" });

    const result = await service.toggleRsvp(event.id, makeActingUser());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("InvalidStateError");
    const rows = await prisma.rsvp.findMany({ where: { eventId: event.id } });
    expect(rows).toHaveLength(0);
  });

  it("rejects RSVPs to an event whose startAt has already passed", async () => {
    const event = await insertEvent(prisma, {
      status: "published",
      startAt: new Date("2000-01-01T00:00:00Z"),
      endAt: new Date("2000-01-01T02:00:00Z"),
    });

    const result = await service.toggleRsvp(event.id, makeActingUser());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("InvalidStateError");
  });

  it("returns EventNotFoundError when the event does not exist in the DB", async () => {
    const result = await service.toggleRsvp("does-not-exist", makeActingUser());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.name).toBe("EventNotFoundError");
  });

  it("enforces (eventId, userId) uniqueness — second call updates rather than inserts", async () => {
    const event = await insertEvent(prisma, { capacity: 10 });

    await service.toggleRsvp(event.id, makeActingUser()); // going
    await service.toggleRsvp(event.id, makeActingUser()); // cancelled
    await service.toggleRsvp(event.id, makeActingUser()); // going again

    const rows = await prisma.rsvp.findMany({
      where: { eventId: event.id, userId: USER_IDS.reader },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("going");
  });
});
