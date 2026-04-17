# CONTRACTS.md

Interface contracts for Group 12 — Local Event Board.

All service methods return `Result<T, E>` from `src/lib/result.ts`.
Services never read from the session — the controller extracts identity and passes it as a parameter.
The repository is the only layer that touches the data store.

---

## Shared Domain Types

```ts
type EventStatus = "draft" | "published" | "cancelled" | "past";

type EventCategory =
  | "social"
  | "educational"
  | "volunteer"
  | "sports"
  | "arts"
  | "other";

type RsvpStatus = "going" | "waitlisted" | "cancelled";

// Roles as defined by the provided auth infrastructure.
// Will be renamed in Sprint 3: admin → Admin, staff → Organizer, user → Member.
type UserRole = "admin" | "staff" | "user";

interface IEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  category: EventCategory;
  capacity: number | null;   // null = no limit
  status: EventStatus;
  startAt: Date;
  endAt: Date;
  organizerId: string;       // references IAuthenticatedUser.id from auth infrastructure
  createdAt: Date;
  updatedAt: Date;
}

interface IRsvp {
  id: string;
  eventId: string;
  userId: string;            // references IAuthenticatedUser.id from auth infrastructure
  status: RsvpStatus;
  createdAt: Date;           // used to determine waitlist ordering (earlier = higher priority)
}

// Passed by the controller to every service method that needs to know who is acting.
interface IActingUser {
  userId: string;
  role: UserRole;
  displayName: string;
}
```

---

## Feature 1 — Event Creation (Brady)

### EventService.createEvent

```ts
interface CreateEventInput {
  title: string;
  description: string;
  location: string;
  category: EventCategory;
  capacity: number | null;
  startAt: Date;
  endAt: Date;
}

type CreateEventError =
  | { name: "InvalidInputError"; message: string }     // missing/malformed fields, endAt <= startAt
  | { name: "UnauthorizedError"; message: string };    // role is not "staff" or "admin"

createEvent(
  input: CreateEventInput,
  actingUser: IActingUser
): Promise<Result<IEvent, CreateEventError>>
```

**Notes:**
- `organizerId` is set from `actingUser.userId` — never from form input.
- New events always start with `status: "draft"`.
- Returns the full `IEvent` on success.

---

## Feature 2 — Event Detail Page (Gautham)

### EventService.getEventById

```ts
type GetEventByIdError =
  | { name: "EventNotFoundError"; message: string };   // event does not exist, or is a draft not
                                                        // visible to the acting user

getEventById(
  eventId: string,
  actingUser: IActingUser
): Promise<Result<IEvent, GetEventByIdError>>
```

**Notes:**
- Draft events are visible only to their organizer (`organizerId === actingUser.userId`) and admins.
- All other users receive `EventNotFoundError` for drafts (treat as not found, not forbidden).
- Cancelled and past events are visible to all authenticated users.

---

## Feature 3 — Event Editing (Brady)

### EventService.updateEvent

```ts
interface UpdateEventInput {
  title?: string;
  description?: string;
  location?: string;
  category?: EventCategory;
  capacity?: number | null;
  startAt?: Date;
  endAt?: Date;
}

type UpdateEventError =
  | { name: "EventNotFoundError"; message: string }    // event does not exist
  | { name: "UnauthorizedError"; message: string }     // not the organizer and not admin
  | { name: "InvalidStateError"; message: string }     // event is cancelled or past
  | { name: "InvalidInputError"; message: string };    // same validation rules as creation

updateEvent(
  eventId: string,
  input: UpdateEventInput,
  actingUser: IActingUser
): Promise<Result<IEvent, UpdateEventError>>
```

**Notes:**
- Only the organizer (`organizerId === actingUser.userId`) or an admin may edit.
- Editing a `cancelled` or `past` event returns `InvalidStateError`.
- Reuses the same field validation rules as `createEvent`.
- Returns the updated `IEvent` on success.

---

## Feature 4 — RSVP Toggle (Gautham)

### RsvpService.toggleRsvp

```ts
type ToggleRsvpError =
  | { name: "EventNotFoundError"; message: string }    // event does not exist or is a draft
  | { name: "UnauthorizedError"; message: string }     // role is "staff" or "admin"
  | { name: "InvalidStateError"; message: string };    // event is cancelled or past

toggleRsvp(
  eventId: string,
  actingUser: IActingUser
): Promise<Result<IRsvp, ToggleRsvpError>>
```

**Notes:**
- Only `user` (Member) role may RSVP. Staff/organizers and admins receive `UnauthorizedError`.
- Three internal cases handled by the service:
  1. No existing RSVP → create with `status: "going"`, or `status: "waitlisted"` if at capacity.
  2. Existing RSVP with `status: "going"` or `status: "waitlisted"` → set to `"cancelled"`.
  3. Existing RSVP with `status: "cancelled"` → reactivate to `"going"` or `"waitlisted"`.
- Returns the resulting `IRsvp` record.

**Cross-feature dependency:**
Feature 7 (My RSVPs Dashboard) calls `POST /events/:id/rsvp` to cancel an RSVP inline.
Feature 9 (Waitlist Promotion) extends the cancellation branch of this service method.
**Do not change the method signature without coordinating with Phan Ha (Feature 7).**

---

## Feature 5 — Event Publishing & Cancellation (David)

### EventService.publishEvent

```ts
type PublishEventError =
  | { name: "EventNotFoundError"; message: string }    // event does not exist
  | { name: "UnauthorizedError"; message: string }     // not the organizer and not admin
  | { name: "InvalidStateError"; message: string };    // event is not in "draft" status

publishEvent(
  eventId: string,
  actingUser: IActingUser
): Promise<Result<IEvent, PublishEventError>>
```

### EventService.cancelEvent

```ts
type CancelEventError =
  | { name: "EventNotFoundError"; message: string }    // event does not exist
  | { name: "UnauthorizedError"; message: string }     // not the organizer and not admin
  | { name: "InvalidStateError"; message: string };    // event is already cancelled or past

cancelEvent(
  eventId: string,
  actingUser: IActingUser
): Promise<Result<IEvent, CancelEventError>>
```

**Notes:**
- `publishEvent`: transitions `draft → published` only.
- `cancelEvent`: transitions `published → cancelled` only. Admins may cancel any event.
- Both return the updated `IEvent` on success.
- Once cancelled, an event cannot be restored.

**Cross-feature dependency:**
Feature 8 (Organizer Event Dashboard) reuses the `POST /events/:id/publish` and
`POST /events/:id/cancel` routes directly from this feature.
**Do not change the route paths without coordinating with the Feature 8 owner.**

---

## Feature 6 — Category and Date Filter (David)

### EventService.listEvents

```ts
type TimeframeFilter = "upcoming" | "this-week" | "this-weekend";

interface ListEventsFilter {
  category?: EventCategory;
  timeframe?: TimeframeFilter;
}

type ListEventsError =
  | { name: "InvalidInputError"; message: string };    // unrecognized category or timeframe value

listEvents(
  filter: ListEventsFilter
): Promise<Result<IEvent[], ListEventsError>>
```

**Notes:**
- Always returns only `published` events — no drafts, cancelled, or past.
- Empty filter object returns all published upcoming events.
- Results are sorted by `startAt` ascending.

**Cross-feature dependency:**
Feature 10 (Event Search, Phan Ha) operates on the same published event list.
The two features use separate routes and service methods but must agree on what
"published upcoming" means: `status === "published"` and `startAt > now`.

---

## Feature 7 — My RSVPs Dashboard (Phan Ha)

### RsvpService.getUserRsvps

```ts
interface IRsvpWithEvent {
  rsvp: IRsvp;
  event: IEvent;
}

interface IUserRsvpDashboard {
  upcoming: IRsvpWithEvent[];   // status "going" or "waitlisted", event is published and future
  past: IRsvpWithEvent[];       // status "cancelled", or event is past/cancelled
}

type GetUserRsvpsError =
  | { name: "UnauthorizedError"; message: string };    // role is "staff" or "admin"

getUserRsvps(
  actingUser: IActingUser
): Promise<Result<IUserRsvpDashboard, GetUserRsvpsError>>
```

**Notes:**
- Only `user` (Member) role may access this dashboard. Staff/admins receive `UnauthorizedError`.
- `upcoming` sorted by `event.startAt` ascending.
- `past` sorted by `event.startAt` descending.
- Cancellation from this page calls Feature 4's `toggleRsvp` route (`POST /events/:id/rsvp`).

---

## Feature 10 — Event Search (Phan Ha)

### EventService.searchEvents

```ts
interface SearchEventsInput {
  query: string;   // empty string is valid and returns all published upcoming events
}

type SearchEventsError =
  | { name: "InvalidInputError"; message: string };    // query exceeds max length (500 chars)

searchEvents(
  input: SearchEventsInput
): Promise<Result<IEvent[], SearchEventsError>>
```

**Notes:**
- Matches against `title`, `description`, and `location` fields (case-insensitive).
- Only returns `published` events with `startAt > now`.
- Empty query is equivalent to listing all published upcoming events.
- Results are sorted by `startAt` ascending.
- Maximum query length: 500 characters.

---

## Cross-Feature Dependency Summary

| Dependency | Owner A | Owner B | What to coordinate |
|---|---|---|---|
| RSVP cancel from dashboard | Feature 4 (Gautham) | Feature 7 (Phan Ha) | `toggleRsvp` signature + route path `POST /events/:id/rsvp` |
| Publish/cancel from organizer dashboard | Feature 5 (David) | Feature 8 (unimplemented) | Route paths `POST /events/:id/publish` and `POST /events/:id/cancel` |
| Event shape used by detail page | Feature 1 (Brady) | Feature 2 (Gautham) | `IEvent` fields returned by `createEvent` and `getEventById` |
| Edit uses creation validation | Feature 1 (Brady) | Feature 3 (Brady) | Validation rules are internal to Brady's features — no cross-owner risk |
| "Published upcoming" definition | Feature 6 (David) | Feature 10 (Phan Ha) | `status === "published"` AND `startAt > now` |
