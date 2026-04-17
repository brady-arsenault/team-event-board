import type express from "express";
import type { Result } from "./lib/result";

/**
 * Interface for our web application.
 *
 * Why have this?
 * - It makes the boundary between "the app" and "the server" explicit.
 * - It makes testing easier (tests can depend on the interface).
 */
export interface IApp {
  /** Return the Express app instance (used by the HTTP server and tests). */
  getExpressApp(): express.Express;
}

/**
 * Interface for a server process that can listen on a port.
 *
 * This is intentionally tiny: it is the "runtime" boundary.
 */
export interface IServer {
  start(port: number): void;
}

// ─── Domain Enums ────────────────────────────────────────────────────────────

export type EventStatus = "draft" | "published" | "cancelled" | "past";

export type EventCategory =
  | "social"
  | "educational"
  | "volunteer"
  | "sports"
  | "arts"
  | "other";

export type RsvpStatus = "going" | "waitlisted" | "cancelled";

export type TimeframeFilter = "upcoming" | "this-week" | "this-weekend";

// ─── Domain Models ───────────────────────────────────────────────────────────

export interface IEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  category: EventCategory;
  capacity: number | null; // null = no limit
  status: EventStatus;
  startAt: Date;
  endAt: Date;
  organizerId: string; // references IAuthenticatedUser.id from auth infrastructure
  createdAt: Date;
  updatedAt: Date;
}

export interface IRsvp {
  id: string;
  eventId: string;
  userId: string; // references IAuthenticatedUser.id from auth infrastructure
  status: RsvpStatus;
  createdAt: Date; // used to determine waitlist ordering (earlier = higher priority)
  updatedAt: Date;
}

// Passed by the controller to every service method that needs to know who is acting.
// Extracted from the session — services never read the session directly.
export interface IActingUser {
  userId: string;
  role: "admin" | "staff" | "user";
  displayName: string;
}

// ─── Event Error Types ───────────────────────────────────────────────────────

export type EventNotFoundError = {
  name: "EventNotFoundError";
  message: string;
};
export type UnauthorizedError = { name: "UnauthorizedError"; message: string };
export type InvalidStateError = { name: "InvalidStateError"; message: string };
export type InvalidInputError = { name: "InvalidInputError"; message: string };

export const EventNotFoundError = (message: string): EventNotFoundError => ({
  name: "EventNotFoundError",
  message,
});
export const UnauthorizedError = (message: string): UnauthorizedError => ({
  name: "UnauthorizedError",
  message,
});
export const InvalidStateError = (message: string): InvalidStateError => ({
  name: "InvalidStateError",
  message,
});
export const InvalidInputError = (message: string): InvalidInputError => ({
  name: "InvalidInputError",
  message,
});

// ─── Repository Interfaces ───────────────────────────────────────────────────

export interface IEventRepository {
  findById(id: string): Promise<IEvent | null>;
  list(): Promise<IEvent[]>;
  create(event: IEvent): Promise<IEvent>;
  update(id: string, changes: Partial<IEvent>): Promise<IEvent | null>;
}

export interface IRsvpRepository {
  findByEventAndUser(eventId: string, userId: string): Promise<IRsvp | null>;
  findByEvent(eventId: string): Promise<IRsvp[]>;
  findByUser(userId: string): Promise<IRsvp[]>;
  create(rsvp: IRsvp): Promise<IRsvp>;
  update(id: string, changes: Partial<IRsvp>): Promise<IRsvp | null>;
  countGoingByEvent(eventId: string): Promise<number>;
}

// ─── Service Interfaces ───────────────────────────────────────────────────────

// Feature 1 — Event Creation (Brady)
export interface CreateEventInput {
  title: string;
  description: string;
  location: string;
  category: EventCategory;
  capacity: number | null;
  startAt: Date;
  endAt: Date;
}

export type CreateEventError = UnauthorizedError | InvalidInputError;

// Feature 2 — Event Detail Page (Gautham)
export type GetEventByIdError = EventNotFoundError | UnauthorizedError;

// Feature 3 — Event Editing (Brady)
export interface UpdateEventInput {
  title?: string;
  description?: string;
  location?: string;
  category?: EventCategory;
  capacity?: number | null;
  startAt?: Date;
  endAt?: Date;
}

export type UpdateEventError =
  | EventNotFoundError
  | UnauthorizedError
  | InvalidStateError
  | InvalidInputError;

// Feature 4 — RSVP Toggle (Gautham)
export type ToggleRsvpError =
  | EventNotFoundError
  | UnauthorizedError
  | InvalidStateError;

export type GetEventRsvpError = EventNotFoundError;

// Feature 5 — Event Publishing & Cancellation (David)
export type PublishEventError =
  | EventNotFoundError
  | UnauthorizedError
  | InvalidStateError;

export type CancelEventError =
  | EventNotFoundError
  | UnauthorizedError
  | InvalidStateError;

// Feature 6 — Category and Date Filter (David)
export interface ListEventsFilter {
  category?: EventCategory;
  timeframe?: TimeframeFilter;
}

export type ListEventsError = InvalidInputError;

// Feature 7 — My RSVPs Dashboard (Phan Ha)
export interface IRsvpWithEvent {
  rsvp: IRsvp;
  event: IEvent;
}

export interface IUserRsvpDashboard {
  upcoming: IRsvpWithEvent[]; // going/waitlisted, published event in the future — sorted by startAt asc
  past: IRsvpWithEvent[]; // cancelled rsvp or past/cancelled event — sorted by startAt desc
}

export type GetUserRsvpsError = UnauthorizedError;

// Feature 10 — Event Search (Phan Ha)
export interface SearchEventsInput {
  query: string; // empty string returns all published upcoming events; max 500 chars
}

export type SearchEventsError = InvalidInputError;

// ─── Aggregated Service Interfaces ───────────────────────────────────────────

export interface IEventService {
  // Feature 1
  createEvent(
    input: CreateEventInput,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, CreateEventError>>;
  // Feature 2
  getEventById(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, GetEventByIdError>>;
  // Feature 3
  updateEvent(
    eventId: string,
    input: UpdateEventInput,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, UpdateEventError>>;
  // Feature 5
  publishEvent(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, PublishEventError>>;
  cancelEvent(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IEvent, CancelEventError>>;
  // Feature 6
  listEvents(
    filter: ListEventsFilter,
  ): Promise<Result<IEvent[], ListEventsError>>;
  // Feature 10
  searchEvents(
    input: SearchEventsInput,
  ): Promise<Result<IEvent[], SearchEventsError>>;
}

export interface IRsvpService {
  // Feature 4
  toggleRsvp(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IRsvp, ToggleRsvpError>>;
  getEventRsvp(
    eventId: string,
    actingUser: IActingUser,
  ): Promise<Result<IRsvp | null, GetEventRsvpError>>;
  // Feature 7
  getUserRsvps(
    actingUser: IActingUser,
  ): Promise<Result<IUserRsvpDashboard, GetUserRsvpsError>>;
}
