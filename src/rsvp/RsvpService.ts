import type {
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
import { UnauthorizedError } from "../contracts";
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
    _eventId: string,
    _actingUser: IActingUser,
  ): Promise<Result<IRsvp, ToggleRsvpError>> {
    throw new Error("Method not implemented.");
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
