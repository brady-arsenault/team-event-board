import { randomUUID } from "node:crypto";
import {
  CancelEventError,
  CreateEventError,
  CreateEventInput,
  GetEventByIdError,
  GetUserRsvpsError,
  IActingUser,
  IEvent,
  IEventRepository,
  IEventService,
  IRsvp,
  IRsvpService,
  IUserRsvpDashboard,
  ListEventsError,
  ListEventsFilter,
  PublishEventError,
  SearchEventsError,
  SearchEventsInput,
  ToggleRsvpError,
  UpdateEventError,
  UpdateEventInput,
  InvalidInputError,
  EventNotFoundError,
  UnauthorizedError,
} from "./contracts";
import { Err, Ok, Result } from "./lib/result";

class EventService implements IEventService, IRsvpService {
  private readonly eventRepository: IEventRepository;

  constructor(eventRepository: IEventRepository) {
    this.eventRepository = eventRepository;
  }

  async toggleRsvp(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IRsvp, ToggleRsvpError>> {
    throw new Error("Method not implemented.");
  }

  async getUserRsvps(
    actingUser: IActingUser,
  ): Promise<Result<IUserRsvpDashboard, GetUserRsvpsError>> {
    throw new Error("Method not implemented.");
  }

  private isValidCapacity(value: unknown): value is number | null {
    return (
      value === null ||
      (typeof value === "number" && Number.isInteger(value) && value > 0)
    );
  }
  private isValidDate(value: unknown): value is Date {
    return value instanceof Date && !Number.isNaN(value.getTime());
  }
  async createEvent(
    input: CreateEventInput,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, CreateEventError>> {
    if (!this.isValidCapacity(input.capacity)) {
      return Err(
        InvalidInputError("capacity must be a positive integer or null."),
      );
    }

    if (
      !this.isValidDate(input.startAt) ||
      !this.isValidDate(input.endAt) ||
      input.startAt >= input.endAt
    ) {
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

  async getEventById(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, GetEventByIdError>> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      return Err(EventNotFoundError("Event not found."));
    } else if (
      event.status === "draft" &&
      event.organizerId !== actingUser.userId &&
      actingUser.role === "user"
    ) {
      return Err(
        UnauthorizedError("You do not have permission to view this event."),
      );
    }
    return Ok(event);
  }

  async updateEvent(
    eventId: string,
    input: UpdateEventInput,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, UpdateEventError>> {
    throw new Error("Method not implemented.");
  }

  async publishEvent(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, PublishEventError>> {
    throw new Error("Method not implemented.");
  }

  async cancelEvent(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, CancelEventError>> {
    throw new Error("Method not implemented.");
  }

  async listEvents(
    filter: ListEventsFilter,
  ): Promise<Result<IEvent[], ListEventsError>> {
    throw new Error("Method not implemented.");
  }

  async searchEvents(
    input: SearchEventsInput,
  ): Promise<Result<IEvent[], SearchEventsError>> {
    throw new Error("Method not implemented.");
  }
}
