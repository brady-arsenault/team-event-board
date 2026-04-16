import type { Response } from "express";
import type { ILoggingService } from "./service/LoggingService";
<<<<<<< HEAD
import type { IEventService, CreateEventInput, UpdateEventInput } from "./contracts";
=======
import type { IEventService, CreateEventInput, ListEventsFilter } from "./contracts";
>>>>>>> b213239 (feat: add home event list controller method)
import {
  getAuthenticatedUser,
  touchAppSession,
  type AppSessionStore,
} from "./session/AppSession";

export interface IEventController {
  showCreateEventForm(res: Response, store: AppSessionStore): Promise<void>;
  showEditEventForm(
    res: Response,
    eventId: string,
    store: AppSessionStore,
  ): Promise<void>;
  createEventFromForm(
    res: Response,
    input: CreateEventInput,
    store: AppSessionStore,
  ): Promise<void>;
<<<<<<< HEAD
  updateEventFromForm(
    res: Response,
    eventId: string,
    input: UpdateEventInput,
=======
  showHome(
    res: Response,
    filter: ListEventsFilter,
>>>>>>> b213239 (feat: add home event list controller method)
    store: AppSessionStore,
  ): Promise<void>;
}

class EventController implements IEventController {
  constructor(
    private readonly service: IEventService,
    private readonly logger: ILoggingService,
  ) {}

  async showCreateEventForm(res: Response, store: AppSessionStore): Promise<void> {
    const session = touchAppSession(store);
    const currentUser = getAuthenticatedUser(store);

    if (!currentUser) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    res.render("events/create", {
      session,
      pageError: null,
    });
  }

  async showEditEventForm(
    res: Response,
    eventId: string,
    store: AppSessionStore,
  ): Promise<void> {
    const session = touchAppSession(store);
    const currentUser = getAuthenticatedUser(store);

    if (!currentUser) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.getEventById(eventId, {
      userId: currentUser.userId,
      role: currentUser.role,
      displayName: currentUser.displayName,
    });

    if (result.ok === false) {
      const status = result.value.name === "EventNotFoundError" ? 404 : 403;
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Show edit event failed: ${result.value.message}`);
      res.status(status).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    const event = result.value;

    if (event.organizerId !== currentUser.userId) {
      this.logger.warn(
        `Blocked edit form access for user ${currentUser.userId} on event ${eventId}`,
      );
      res.status(403).render("partials/error", {
        message: "Only the event organizer may edit this event.",
        layout: false,
      });
      return;
    }

    res.render("events/edit", {
      session,
      event,
      pageError: null,
    });
  }

  async createEventFromForm(
    res: Response,
    input: CreateEventInput,
    store: AppSessionStore,
  ): Promise<void> {
    const session = touchAppSession(store);
    const currentUser = getAuthenticatedUser(store);

    if (!currentUser) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.createEvent(input, {
      userId: currentUser.userId,
      role: currentUser.role,
      displayName: currentUser.displayName,
    });

    if (result.ok === false) {
      const status = result.value.name === "InvalidInputError" ? 400 : 403;
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Create event failed: ${result.value.message}`);
      res.status(status).render("home", {
        session,
        pageError: result.value.message,
      });
      return;
    }

    this.logger.info(`Created event ${result.value.id}`);
    res.redirect("/home");
  }

<<<<<<< HEAD
  async updateEventFromForm(
    res: Response,
    eventId: string,
    input: UpdateEventInput,
=======
  async showHome(
    res: Response,
    filter: ListEventsFilter,
>>>>>>> b213239 (feat: add home event list controller method)
    store: AppSessionStore,
  ): Promise<void> {
    const session = touchAppSession(store);
    const currentUser = getAuthenticatedUser(store);

    if (!currentUser) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

<<<<<<< HEAD
    const result = await this.service.updateEvent(eventId, input, {
      userId: currentUser.userId,
      role: currentUser.role,
      displayName: currentUser.displayName,
    });

    if (result.ok === false) {
      let status = 400;
      if (result.value.name === "EventNotFoundError") {
        status = 404;
      } else if (result.value.name === "UnauthorizedError") {
        status = 403;
      }

      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Update event failed: ${result.value.message}`);
      res.status(status).render("events/edit", {
        session,
        pageError: result.value.message,
        eventId,
        input,
=======
    const result = await this.service.listEvents(filter);

    if (result.ok === false) {
      this.logger.warn(`List events failed: ${result.value.message}`);
      res.status(400).render("home", {
        session,
        pageError: result.value.message,
        events: [],
        filters: {
          category: filter.category ?? "",
          timeframe: filter.timeframe ?? "",
        },
>>>>>>> b213239 (feat: add home event list controller method)
      });
      return;
    }

<<<<<<< HEAD
    this.logger.info(`Updated event ${result.value.id}`);
    res.redirect("/home");
    }
=======
    res.render("home", {
      session,
      pageError: null,
      events: result.value,
      filters: {
        category: filter.category ?? "",
        timeframe: filter.timeframe ?? "",
      },
    });
  }
>>>>>>> b213239 (feat: add home event list controller method)
}

export function CreateEventController(
  service: IEventService,
  logger: ILoggingService,
): IEventController {
  return new EventController(service, logger);
}
