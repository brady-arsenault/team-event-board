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
import type { ILoggingService } from "../service/LoggingService";

class RsvpService implements IRsvpService {
  constructor(
    private readonly eventRepository: IEventRepository,
    private readonly rsvpRepository: IRsvpRepository,
    private readonly logger: ILoggingService,
  ) {}

  // Feature 4 — owned by Gautham
  async toggleRsvp(
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
        const updatedRsvp = await this.rsvpRepository.update(existingRsvp.id, {
          status: "cancelled",
          updatedAt: now,
        });
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
      const event = await this.eventRepository.findById(rsvp.eventId);
      if (event === null) continue;

      const eventIsLive = event.status === "published" && event.startAt > now;
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
