import type { PrismaClient } from "@prisma/client";
import type { IRsvp, IRsvpRepository, RsvpStatus } from "../contracts";

/**
 * Prisma-backed repository for RSVPs. Implements the same {@link IRsvpRepository}
 * interface as the in-memory version, so the service layer is unchanged.
 *
 * Sprint 3: only the Repository layer changes when we move from in-memory arrays
 * to a real database. The schema enforces (eventId, userId) uniqueness at the
 * DB level, matching the invariant Feature 4 already maintains in service code.
 */
class PrismaRsvpRepository implements IRsvpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEventAndUser(
    eventId: string,
    userId: string,
  ): Promise<IRsvp | null> {
    const row = await this.prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    return row ? toDomain(row) : null;
  }

  async findByEvent(eventId: string): Promise<IRsvp[]> {
    const rows = await this.prisma.rsvp.findMany({ where: { eventId } });
    return rows.map(toDomain);
  }

  async findByUser(userId: string): Promise<IRsvp[]> {
    const rows = await this.prisma.rsvp.findMany({ where: { userId } });
    return rows.map(toDomain);
  }

  async create(rsvp: IRsvp): Promise<IRsvp> {
    const row = await this.prisma.rsvp.create({
      data: {
        id: rsvp.id,
        eventId: rsvp.eventId,
        userId: rsvp.userId,
        status: rsvp.status,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt,
      },
    });
    return toDomain(row);
  }

  async update(
    id: string,
    changes: Partial<IRsvp>,
  ): Promise<IRsvp | null> {
    // Match the in-memory contract: return null instead of throwing when the
    // row doesn't exist. We pre-check rather than catching Prisma's P2025.
    const existing = await this.prisma.rsvp.findUnique({ where: { id } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (changes.status !== undefined) data.status = changes.status;
    if (changes.eventId !== undefined) data.eventId = changes.eventId;
    if (changes.userId !== undefined) data.userId = changes.userId;
    if (changes.createdAt !== undefined) data.createdAt = changes.createdAt;
    // Always bump updatedAt to match the in-memory implementation.
    data.updatedAt = changes.updatedAt ?? new Date();

    const row = await this.prisma.rsvp.update({
      where: { id },
      data,
    });
    return toDomain(row);
  }

  async countGoingByEvent(eventId: string): Promise<number> {
    return this.prisma.rsvp.count({
      where: { eventId, status: "going" },
    });
  }
}

/**
 * Translate a Prisma row (where status is a plain string) into the IRsvp
 * domain type (where status is a string-literal union).
 */
function toDomain(row: {
  id: string;
  eventId: string;
  userId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): IRsvp {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    status: row.status as RsvpStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function CreatePrismaRsvpRepository(
  prisma: PrismaClient,
): IRsvpRepository {
  return new PrismaRsvpRepository(prisma);
}
