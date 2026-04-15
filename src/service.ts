import { CancelEventError, CreateEventError, CreateEventInput, GetEventByIdError, GetUserRsvpsError, IActingUser, IEvent, IEventService, IRsvp, IRsvpService, IUserRsvpDashboard, ListEventsError, ListEventsFilter, PublishEventError, SearchEventsError, SearchEventsInput, ToggleRsvpError, UpdateEventError, UpdateEventInput, InvalidInputError } from "./contracts";
import { Err, Result } from "./lib/result";

class EventService implements IEventService, IRsvpService {
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

        throw new Error("Method not implemented.");
    }



    async getEventById(eventId: string, actingUser: IActingUser): Promise<Result<IEvent, GetEventByIdError>> {
        throw new Error("Method not implemented.");
    }

    async updateEvent(eventId: string, input: UpdateEventInput, actingUser: IActingUser): Promise<Result<IEvent, UpdateEventError>> {
        throw new Error("Method not implemented.");
    }

    async publishEvent(eventId: string, actingUser: IActingUser): Promise<Result<IEvent, PublishEventError>> {
        throw new Error("Method not implemented.");
    }

    async cancelEvent(eventId: string, actingUser: IActingUser): Promise<Result<IEvent, CancelEventError>> {
        throw new Error("Method not implemented.");
    }

    async listEvents(filter: ListEventsFilter): Promise<Result<IEvent[], ListEventsError>> {
        throw new Error("Method not implemented.");
    }

    async searchEvents(input: SearchEventsInput): Promise<Result<IEvent[], SearchEventsError>> {
        throw new Error("Method not implemented.");
    }

}