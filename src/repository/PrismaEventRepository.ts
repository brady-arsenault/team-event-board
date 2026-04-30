import type { PrismaClient } from "@prisma/client";
import type {
  EventCategory,
  EventStatus,
  IEvent,
  IEventRepository,
} from "../contracts";

/**
 * Prisma-backed repository for events. Implements the same {@link IEventRepository}
 * interface as the in-memory version, so the service layer is unchanged.
 *
 * Sprint 3: only the Repository layer changes when we move from in-memory arrays
 * to a real database. Validation, business rules, and HTTP concerns stay in the
 * Service and Controller layers.
 */
class PrismaEventRepository implements IEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<IEvent | null> {
    const row = await this.prisma.event.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<IEvent[]> {
    const rows = await this.prisma.event.findMany();
    return rows.map(toDomain);
  }

  async create(event: IEvent): Promise<IEvent> {
    const row = await this.prisma.event.create({
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
    return toDomain(row);
  }

  async update(
    id: string,
    changes: Partial<IEvent>,
  ): Promise<IEvent | null> {
    // Match the in-memory contract: return null instead of throwing when the row
    // doesn't exist. Prisma's `update` throws P2025; we pre-check rather than
    // catch so the happy path doesn't allocate an Error.
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (changes.title !== undefined) data.title = changes.title;
    if (changes.description !== undefined) data.description = changes.description;
    if (changes.location !== undefined) data.location = changes.location;
    if (changes.category !== undefined) data.category = changes.category;
    if (changes.capacity !== undefined) data.capacity = changes.capacity;
    if (changes.status !== undefined) data.status = changes.status;
    if (changes.startAt !== undefined) data.startAt = changes.startAt;
    if (changes.endAt !== undefined) data.endAt = changes.endAt;
    // Always bump updatedAt to match the in-memory implementation.
    data.updatedAt = changes.updatedAt ?? new Date();

    const row = await this.prisma.event.update({
      where: { id },
      data,
    });
    return toDomain(row);
  }
}

/**
 * Translate a Prisma row (where status/category are plain strings) into the
 * IEvent domain type (where they are string-literal unions). The DB stores
 * strings because SQLite has no native enum; the service layer is responsible
 * for ensuring only valid values are written.
 */
function toDomain(row: {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  capacity: number | null;
  status: string;
  startAt: Date;
  endAt: Date;
  organizerId: string;
  createdAt: Date;
  updatedAt: Date;
}): IEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    category: row.category as EventCategory,
    capacity: row.capacity,
    status: row.status as EventStatus,
    startAt: row.startAt,
    endAt: row.endAt,
    organizerId: row.organizerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function CreatePrismaEventRepository(
  prisma: PrismaClient,
): IEventRepository {
  return new PrismaEventRepository(prisma);
}
