import { randomUUID } from "node:crypto";
import {
  CancelEventError,
  CreateEventError,
  CreateEventInput,
  EventNotFoundError,
  GetEventByIdError,
  IActingUser,
  IEvent,
  IEventRepository,
  IEventService,
  ListDraftsError,
  ListEventsError,
  ListEventsFilter,
  PublishEventError,
  SearchEventsError,
  SearchEventsInput,
  UnauthorizedError,
  UpdateEventError,
  UpdateEventInput,
  InvalidInputError,
  InvalidStateError,
} from "./contracts";
import { Err, Ok, Result } from "./lib/result";
import { ILoggingService } from "./service/LoggingService";
import { CreateEventSearchService, IEventSearchService } from "./events/EventSearchService";

/**
 * Treat a published event whose endAt is in the past as "past". The repository
 * never writes "past" — it's derived at read time so we don't need a scheduled
 * job to flip statuses.
 */
export function deriveEventStatus(event: IEvent, now: Date = new Date()): IEvent {
    if (event.status === "published" && event.endAt < now) {
        return { ...event, status: "past" };
    }
    return event;
}

interface TimeframeRange {
    startAfter?: Date;
    endBefore?: Date;
}

function computeTimeframeRange(
    timeframe: ListEventsFilter["timeframe"],
    now: Date,
): TimeframeRange | undefined {
    if (timeframe === "this-week") {
        const endOfWeek = new Date(now);
        const currentDay = now.getDay();
        const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay;
        endOfWeek.setDate(now.getDate() + daysUntilSunday);
        endOfWeek.setHours(23, 59, 59, 999);
        return { endBefore: endOfWeek };
    }

    if (timeframe === "this-weekend") {
        const currentDay = now.getDay();
        const weekendStart = new Date(now);
        const weekendEnd = new Date(now);
        const daysUntilSaturday = currentDay === 0 ? -1 : 6 - currentDay;
        const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay;
        weekendStart.setDate(now.getDate() + daysUntilSaturday);
        weekendStart.setHours(0, 0, 0, 0);
        weekendEnd.setDate(now.getDate() + daysUntilSunday);
        weekendEnd.setHours(23, 59, 59, 999);
        return { startAfter: weekendStart, endBefore: weekendEnd };
    }

    return undefined;
}

class EventService implements IEventService {
    private readonly eventRepository: IEventRepository;
    private readonly eventSearchService: IEventSearchService;
    private readonly logger: ILoggingService;

    constructor(eventRepository: IEventRepository, logger: ILoggingService) {
        this.eventRepository = eventRepository;
        this.eventSearchService = CreateEventSearchService(eventRepository);
        this.logger = logger;
    }

    private isValidCapacity(value: unknown): value is number | null {
        return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
    }
    private isValidDate(value: unknown): value is Date {
        return value instanceof Date && !Number.isNaN(value.getTime());
    }

    private withDerivedStatus(event: IEvent, now: Date = new Date()): IEvent {
        return deriveEventStatus(event, now);
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
        const event = await this.eventRepository.findById(eventId);
        if (!event) {
            return Err(EventNotFoundError(`Event with id ${eventId} not found.`));
        } else if (event.status === "draft" && event.organizerId !== actingUser.userId && actingUser.role !== "admin") {
            return Err(UnauthorizedError(`You do not have permission to view this event.`));
        }
        return Ok(this.withDerivedStatus(event));
    }

    async updateEvent(eventId: string, input: UpdateEventInput, actingUser: IActingUser): Promise<Result<IEvent, UpdateEventError>> {
        if (input.capacity !== undefined && !this.isValidCapacity(input.capacity)) {
            return Err(InvalidInputError("capacity must be a positive integer or null."));
        }

        if (input.startAt !== undefined && !this.isValidDate(input.startAt)) {
            return Err(InvalidInputError("startAt must be a valid date."));
        }

        if (input.endAt !== undefined && !this.isValidDate(input.endAt)) {
            return Err(InvalidInputError("endAt must be a valid date."));
        }

        const event = await this.eventRepository.findById(eventId);
        if (event === null) {
            return Err(EventNotFoundError("Event not found."));
        }

        if (actingUser.role !== "admin" && event.organizerId !== actingUser.userId) {
            return Err(UnauthorizedError("You are not allowed to edit this event."));
        }

        if (event.status === "cancelled" || event.status === "past") {
            return Err(InvalidStateError("Cancelled or past events cannot be edited."));
        }

        const startAt = input.startAt ?? event.startAt;
        const endAt = input.endAt ?? event.endAt;
        if (startAt >= endAt) {
            return Err(InvalidInputError("startAt must be before endAt."));
        }

        const changes: Partial<IEvent> = { updatedAt: new Date() };
        if (input.title !== undefined) changes.title = input.title;
        if (input.description !== undefined) changes.description = input.description;
        if (input.location !== undefined) changes.location = input.location;
        if (input.category !== undefined) changes.category = input.category;
        if (input.capacity !== undefined) changes.capacity = input.capacity;
        if (input.startAt !== undefined) changes.startAt = input.startAt;
        if (input.endAt !== undefined) changes.endAt = input.endAt;

        const updatedEvent = await this.eventRepository.update(eventId, changes);
        if (updatedEvent === null) {
            return Err(EventNotFoundError("Event not found."));
        }

        return Ok(updatedEvent);
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
        if (event.endAt < new Date()) {
            return Err(InvalidStateError("Cannot publish an event whose end time has already passed."));
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
        if (event.endAt < new Date()) {
            return Err(InvalidStateError("This event has already ended."));
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
        const range = computeTimeframeRange(filter.timeframe, now);

        let events = await this.eventRepository.findMany({
            status: "published",
            startAfter: now,
            startBefore: range?.endBefore,
            category: filter.category,
        });

        // "this-weekend" needs a lower bound (Saturday) too — push that filter
        // here rather than in the repo to keep the contract narrow.
        if (range?.startAfter && range.startAfter > now) {
            events = events.filter((event) => event.startAt >= range.startAfter!);
        }

        events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
        return Ok(events);
    }


    async listDrafts(actingUser: IActingUser): Promise<Result<IEvent[], ListDraftsError>> {
        const drafts = await this.eventRepository.findMany({
            status: "draft",
            organizerId: actingUser.role === "admin" ? undefined : actingUser.userId,
        });
        drafts.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return Ok(drafts);
    }

    // Feature 10 — Event Search (Phan Ha). Delegates to src/events/EventSearchService.ts.
    async searchEvents(input: SearchEventsInput): Promise<Result<IEvent[], SearchEventsError>> {
        return this.eventSearchService.searchEvents(input);
    }
}

export function CreateEventService(
  eventRepository: IEventRepository,
  logger: ILoggingService,
): IEventService {
  return new EventService(eventRepository, logger);
}