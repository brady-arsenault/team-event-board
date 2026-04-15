import { CancelEventError, CreateEventError, CreateEventInput, GetEventByIdError, GetUserRsvpsError, IActingUser, IEvent, IEventService, IRsvp, IRsvpService, IUserRsvpDashboard, ListEventsError, ListEventsFilter, PublishEventError, SearchEventsError, SearchEventsInput, ToggleRsvpError, UpdateEventError, UpdateEventInput } from "./contracts";
import { Result } from "./lib/result";

class EventService implements IEventService, IRsvpService {
    async toggleRsvp(eventId: string, actingUser: IActingUser): Promise<Result<IRsvp, ToggleRsvpError>> {
        throw new Error("Method not implemented.");
    }

    async getUserRsvps(actingUser: IActingUser): Promise<Result<IUserRsvpDashboard, GetUserRsvpsError>> {
        throw new Error("Method not implemented.");
    }

    async createEvent(input: CreateEventInput, actingUser: IActingUser): Promise<Result<IEvent, CreateEventError>> {
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