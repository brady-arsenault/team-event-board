import type {
  GetEventRsvpError,
  GetUserRsvpsError,
  IActingUser,
  IEventRepository,
  IRsvp,
  IRsvpRepository,
  IRsvpService,
  IRsvpWithEvent,
  IUserRsvpDashboard,
  ToggleRsvpError,
} from "../contracts";
import { EventNotFoundError, InvalidStateError, UnauthorizedError } from "../contracts";
import { Err, Ok, Result } from "../lib/result";
import { deriveEventStatus } from "../service";
import type { ILoggingService } from "../service/LoggingService";

class RsvpService implements IRsvpService {
  // Per-event mutex chain. Toggle/cancel/promote operations on the same event
  // are serialized so the count-then-write sequence cannot race within this
  // process. (For multi-process deploys, you'd need a DB-level lock or a
  // serializable transaction.)
  private readonly eventLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly eventRepository: IEventRepository,
    private readonly rsvpRepository: IRsvpRepository,
    private readonly logger: ILoggingService,
  ) {}

  private async withEventLock<T>(
    eventId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.eventLocks.get(eventId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    this.eventLocks.set(eventId, next);
    try {
      return await next;
    } finally {
      if (this.eventLocks.get(eventId) === next) {
        this.eventLocks.delete(eventId);
      }
    }
  }

  // Feature 4 — owned by Gautham
  async toggleRsvp(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IRsvp, ToggleRsvpError>> {
    return this.withEventLock(eventId, () => this.doToggleRsvp(eventId, actingUser));
  }

  private async doToggleRsvp(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IRsvp, ToggleRsvpError>> {
    const event = await this.eventRepository.findById(eventId);

    if (event === null) {
      return Err(EventNotFoundError("Event not found."));
    }

    const now = new Date();
    if (event.status === "cancelled" || event.status === "past" || event.startAt < now) {
      return Err(InvalidStateError("Event is cancelled or no longer accepting RSVPs."));
    }

    const existingRsvp = await this.rsvpRepository.findByEventAndUser(
      eventId,
      actingUser.userId,
    );

    if (existingRsvp) {
      const isActive = existingRsvp.status === "going" || existingRsvp.status === "waitlisted";

      if (isActive) {
        const wasGoing = existingRsvp.status === "going";
        const updatedRsvp = await this.rsvpRepository.update(existingRsvp.id, {
          status: "cancelled",
          updatedAt: now,
        });

        if (wasGoing && event.capacity !== null) {
          await this.promoteOldestWaitlisted(eventId, event.capacity, now);
        }

        return Ok(updatedRsvp!);
      } else {
        const goingCount = await this.rsvpRepository.countGoingByEvent(eventId);
        const isFull = event.capacity !== null && goingCount >= event.capacity;
        const updatedRsvp = await this.rsvpRepository.update(existingRsvp.id, {
          status: isFull ? "waitlisted" : "going",
          updatedAt: now,
        });
        return Ok(updatedRsvp!);
      }
    } else {
      const goingCount = await this.rsvpRepository.countGoingByEvent(eventId);
      const isFull = event.capacity !== null && goingCount >= event.capacity;
      const newRsvp: IRsvp = {
        id: crypto.randomUUID(),
        eventId,
        userId: actingUser.userId,
        status: isFull ? "waitlisted" : "going",
        createdAt: now,
        updatedAt: now,
      };
      const createdRsvp = await this.rsvpRepository.create(newRsvp);
      return Ok(createdRsvp);
    }
  }

  private async promoteOldestWaitlisted(
    eventId: string,
    capacity: number,
    now: Date,
  ): Promise<void> {
    const goingCount = await this.rsvpRepository.countGoingByEvent(eventId);
    if (goingCount >= capacity) return;

    const all = await this.rsvpRepository.findByEvent(eventId);
    const oldestWaitlisted = all
      .filter((r) => r.status === "waitlisted")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

    if (!oldestWaitlisted) return;

    await this.rsvpRepository.update(oldestWaitlisted.id, {
      status: "going",
      updatedAt: now,
    });
  }

  async getEventRsvp(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IRsvp | null, GetEventRsvpError>> {
    const event = await this.eventRepository.findById(eventId);
    if (event === null) {
      return Err(EventNotFoundError("Event not found."));
    }
    const rsvp = await this.rsvpRepository.findByEventAndUser(eventId, actingUser.userId);
    return Ok(rsvp);
  }

  // Feature 7 — My RSVPs Dashboard (Phan Ha)
  async getUserRsvps(
    actingUser: IActingUser,
  ): Promise<Result<IUserRsvpDashboard, GetUserRsvpsError>> {
    if (actingUser.role !== "user") {
      return Err(
        UnauthorizedError("Only members may view the RSVP dashboard."),
      );
    }

    const rsvps = await this.rsvpRepository.findByUser(actingUser.userId);
    const now = new Date();
    const upcoming: IRsvpWithEvent[] = [];
    const past: IRsvpWithEvent[] = [];

    for (const rsvp of rsvps) {
      const stored = await this.eventRepository.findById(rsvp.eventId);
      if (stored === null) continue;
      const event = deriveEventStatus(stored, now);

      // An event is "live" if it's published and hasn't ended yet — events
      // currently in progress (startAt < now < endAt) belong in upcoming, not
      // past.
      const eventIsLive = event.status === "published" && event.endAt > now;
      const rsvpIsActive =
        rsvp.status === "going" || rsvp.status === "waitlisted";

      if (rsvpIsActive && eventIsLive) {
        upcoming.push({ rsvp, event });
      } else {
        past.push({ rsvp, event });
      }
    }

    upcoming.sort(
      (a, b) => a.event.startAt.getTime() - b.event.startAt.getTime(),
    );
    past.sort((a, b) => b.event.startAt.getTime() - a.event.startAt.getTime());

    return Ok({ upcoming, past });
  }
}

export function CreateRsvpService(
  eventRepository: IEventRepository,
  rsvpRepository: IRsvpRepository,
  logger: ILoggingService,
): IRsvpService {
  return new RsvpService(eventRepository, rsvpRepository, logger);
}
