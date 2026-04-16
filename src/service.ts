import { randomUUID } from "node:crypto";
import { CancelEventError, CreateEventError, CreateEventInput, EventNotFoundError, GetEventByIdError, GetUserRsvpsError, IActingUser, IEvent, IEventRepository, IEventService, IRsvp, IRsvpService, IUserRsvpDashboard, ListEventsError, ListEventsFilter, PublishEventError, SearchEventsError, SearchEventsInput, ToggleRsvpError, UnauthorizedError, UpdateEventError, UpdateEventInput, InvalidInputError, InvalidStateError } from "./contracts";
import { Err, Ok, Result } from "./lib/result";
import { ILoggingService } from "./service/LoggingService";
import { IEventController } from "./controller";

class EventService implements IEventService, IRsvpService {
    private readonly eventRepository: IEventRepository;
    private readonly logger: ILoggingService;

    constructor(eventRepository: IEventRepository, logger: ILoggingService) {
        this.eventRepository = eventRepository;
        this.logger = logger;
    }

    async toggleRsvp(eventId: string, actingUser: IActingUser): Promise<Result<IRsvp, ToggleRsvpError>> {
        throw new Error("Method not implemented.");
    }

    async getUserRsvps(actingUser: IActingUser): Promise<Result<IUserRsvpDashboard, GetUserRsvpsError>> {
        throw new Error("Method not implemented.");
    }



    private isValidCapacity(value: unknown): value is number | null {
        return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
    }
    private isValidDate(value: unknown): value is Date {
        return value instanceof Date && !Number.isNaN(value.getTime());
    }
    async createEvent(input: CreateEventInput, actingUser: IActingUser): Promise<Result<IEvent, CreateEventError>> {
        if (!this.isValidCapacity(input.capacity)) {
            return Err(InvalidInputError("capacity must be a positive integer or null."));
        }

        if (!this.isValidDate(input.startAt) || !this.isValidDate(input.endAt) || input.startAt >= input.endAt) {
            return Err(InvalidInputError("startAt must be before endAt."));
        }

        const event: IEvent = {
            id: randomUUID(),
            title: input.title,
            description: input.description,
            location: input.location,
            category: input.category,
            capacity: input.capacity,
            status: "draft",
            startAt: input.startAt,
            endAt: input.endAt,
            organizerId: actingUser.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const createdEvent = await this.eventRepository.create(event);
        return Ok(createdEvent);
    }



    async getEventById(eventId: string, actingUser: IActingUser): Promise<Result<IEvent, GetEventByIdError>> {
        throw new Error("Method not implemented.");
    }

    async updateEvent(eventId: string, input: UpdateEventInput, actingUser: IActingUser): Promise<Result<IEvent, UpdateEventError>> {
        throw new Error("Method not implemented.");
    }

    async publishEvent(eventId: string, actingUser: IActingUser): Promise<Result<IEvent, PublishEventError>> {
        const event = await this.eventRepository.findById(eventId);
        if (event === null) {
            return Err(EventNotFoundError("Event not found."));
        }
        //Only the organizer or an admin can publish an event.
        if (actingUser.role !== "admin" && event.organizerId !== actingUser.userId) {
            return Err(UnauthorizedError("You are not allowed to publish this event."));
        }
        //A draft event can move to published.
        if (event.status !== "draft") {
            return Err(InvalidStateError("Only draft events can be published."));
        }

        const updatedEvent = await this.eventRepository.update(eventId, {
            status: "published",
            updatedAt: new Date(),
        });

        if (updatedEvent === null) {
            return Err(EventNotFoundError("Event not found."));
        }

        return Ok(updatedEvent);
    }

    async cancelEvent(eventId: string, actingUser: IActingUser): Promise<Result<IEvent, CancelEventError>> {
        const event = await this.eventRepository.findById(eventId);
        if (event === null) {
            return Err(EventNotFoundError("Event not found."));
        }
        //the organizer or an admin can cancel an event.
        if (actingUser.role !== "admin" && event.organizerId !== actingUser.userId) {
            return Err(UnauthorizedError("You are not allowed to cancel this event."));
        }
        //published events can be cancelled.
        if (event.status !== "published") {
            return Err(InvalidStateError("Only published events can be cancelled."));
        }

        const updatedEvent = await this.eventRepository.update(eventId, {
            status: "cancelled",
            updatedAt: new Date(),
        });

        if (updatedEvent === null) {
            return Err(EventNotFoundError("Event not found."));
        }

        return Ok(updatedEvent);
    }

    async listEvents(filter: ListEventsFilter): Promise<Result<IEvent[], ListEventsError>> {
        const allowedCategories = [
            "social",
            "educational",
            "volunteer",
            "sports",
            "arts",
            "other",
        ] as const;
        const allowedTimeframes = [
            "upcoming",
            "this-week",
            "this-weekend",
        ] as const;

        if (filter.category !== undefined && !allowedCategories.includes(filter.category)) {
            return Err(InvalidInputError("Invalid category filter."));
        }

        if (filter.timeframe !== undefined && !allowedTimeframes.includes(filter.timeframe)) {
            return Err(InvalidInputError("Invalid timeframe filter."));
        }

        const now = new Date();
        let events = await this.eventRepository.list();
        //Start with only published events that have not started yet
        events = events.filter((event) => {
            return event.status === "published" && event.startAt > now;
        });

        if (filter.category !== undefined) {
            events = events.filter((event) => event.category === filter.category);
        }

        //This week meaning from now through the end of the current week
        if (filter.timeframe === "this-week") {
            const endOfWeek = new Date(now);
            const currentDay = now.getDay();
            let daysUntilSunday = 0;
            if (currentDay !== 0) {
                daysUntilSunday = 7 - currentDay;
            }

            endOfWeek.setDate(now.getDate() + daysUntilSunday);
            endOfWeek.setHours(23, 59, 59, 999);
            events = events.filter((event) => event.startAt <= endOfWeek);
        }

        //This weekend meaning Saturday through Sunday
        if (filter.timeframe === "this-weekend") {
            const currentDay = now.getDay();
            const weekendStart = new Date(now);
            const weekendEnd = new Date(now);
            let daysUntilSaturday = 0;
            let daysUntilSunday = 0;
            if (currentDay === 0) {
                daysUntilSaturday = -1;
                daysUntilSunday = 0;
            } else {
                daysUntilSaturday = 6 - currentDay;
                daysUntilSunday = 7 - currentDay;
            }

            weekendStart.setDate(now.getDate() + daysUntilSaturday);
            weekendStart.setHours(0, 0, 0, 0);
            weekendEnd.setDate(now.getDate() + daysUntilSunday);
            weekendEnd.setHours(23, 59, 59, 999);
            events = events.filter((event) => {
                return event.startAt >= weekendStart && event.startAt <= weekendEnd;
            });
        }

        //Show the earlier events first
        events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
        return Ok(events);
    }


    async searchEvents(input: SearchEventsInput): Promise<Result<IEvent[], SearchEventsError>> {
        throw new Error("Method not implemented.");
    }

}

export function CreateEventService(
  service: IEventRepository,
  logger: ILoggingService,
): IEventService {
  return new EventService(service, logger);
}
