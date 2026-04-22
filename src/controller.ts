import type { Response } from "express";
import type { ILoggingService } from "./service/LoggingService";
import type {
  IEventService,
  CreateEventInput,
  UpdateEventInput,
  ListEventsFilter,
} from "./contracts";
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
  updateEventFromForm(
    res: Response,
    eventId: string,
    input: UpdateEventInput,
    store: AppSessionStore,
  ): Promise<void>;
  publishEventFromForm(
    res: Response,
    eventId: string,
    store: AppSessionStore,
    isHtmx: boolean,
  ): Promise<void>;
  cancelEventFromForm(
    res: Response,
    eventId: string,
    store: AppSessionStore,
    isHtmx: boolean,
  ): Promise<void>;
  showHome(
    res: Response,
    filter: ListEventsFilter,
    store: AppSessionStore,
    isHtmx: boolean,
  ): Promise<void>;
  eventDetailFromForm(
    res: Response,
    eventId: string,
    store: AppSessionStore,
    isHtmx: boolean,
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

  async updateEventFromForm(
    res: Response,
    eventId: string,
    input: UpdateEventInput,
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
      });
      return;
    }

    this.logger.info(`Updated event ${result.value.id}`);
    res.redirect("/home");
  }

  async publishEventFromForm(//added publish method to controller
    res: Response,
    eventId: string,
    store: AppSessionStore,
    isHtmx: boolean,
  ): Promise<void> {
    const currentUser = getAuthenticatedUser(store);

    if (!currentUser) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.publishEvent(eventId, {
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
      log.call(this.logger, `Publish event failed: ${result.value.message}`);
      res.status(status).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    if (isHtmx) {
      const session = touchAppSession(store);
      const updatedEventResult = await this.service.getEventById(eventId, {
        userId: currentUser.userId,
        role: currentUser.role,
        displayName: currentUser.displayName,
      });

      if (updatedEventResult.ok === false) {
        res.status(500).render("partials/error", {
          message: "Updated event could not be loaded.",
          layout: false,
        });
        return;
      }

      this.logger.info(`Published event ${result.value.id}`);
      res.render("events/detail", {
        session,
        event: updatedEventResult.value,
        pageError: null,
        layout: false,
      });
      return;
    }

    this.logger.info(`Published event ${result.value.id}`);
    res.redirect("/home");
  }

  async cancelEventFromForm(//added cancel method to controller
    res: Response,
    eventId: string,
    store: AppSessionStore,
    isHtmx: boolean,
  ): Promise<void> {
    const currentUser = getAuthenticatedUser(store);

    if (!currentUser) {
      res.status(401).render("partials/error", {
        message: "Please log in to continue.",
        layout: false,
      });
      return;
    }

    const result = await this.service.cancelEvent(eventId, {
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
      log.call(this.logger, `Cancel event failed: ${result.value.message}`);
      res.status(status).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    if (isHtmx) {
      const session = touchAppSession(store);
      const updatedEventResult = await this.service.getEventById(eventId, {
        userId: currentUser.userId,
        role: currentUser.role,
        displayName: currentUser.displayName,
      });

      if (updatedEventResult.ok === false) {
        res.status(500).render("partials/error", {
          message: "Updated event could not be loaded.",
          layout: false,
        });
        return;
      }

      this.logger.info(`Cancelled event ${result.value.id}`);
      res.render("events/detail", {
        session,
        event: updatedEventResult.value,
        pageError: null,
        layout: false,
      });
      return;
    }

    this.logger.info(`Cancelled event ${result.value.id}`);
    res.redirect("/home");
  }

  async showHome(
    res: Response,
    filter: ListEventsFilter,
    store: AppSessionStore,
    isHtmx: boolean,
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

    const result = await this.service.listEvents(filter);

    if (result.ok === false) {
      this.logger.warn(`List events failed: ${result.value.message}`);

      if (isHtmx) {
        res.status(400).render("partials/error", {
          message: result.value.message,
          layout: false,
        });
        return;
      }

      res.status(400).render("home", {
        session,
        pageError: result.value.message,
        events: [],
        filters: {
          category: filter.category ?? "",
          timeframe: filter.timeframe ?? "",
        },
        layout: isHtmx ? false : undefined,
      });
      return;
    }

    if (isHtmx) {
      res.render("events/partials/event-list", {
        events: result.value,
        layout: false,
      });
      return;
    }

    res.render("home", {
      session,
      pageError: null,
      events: result.value,
      filters: {
        category: filter.category ?? "",
        timeframe: filter.timeframe ?? "",
      },
      layout: isHtmx ? false : undefined,
    });
  }

  async eventDetailFromForm(
    res: Response,
    eventId: string,
    store: AppSessionStore,
    isHtmx: boolean,
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
      log.call(this.logger, `Show event detail failed: ${result.value.message}`);
      res.status(status).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    const event = result.value;

    res.render("events/detail", {
      session,
      event,
      pageError: null,
      layout: isHtmx ? false : undefined,
    });
  }
}

export function CreateEventController(
  service: IEventService,
  logger: ILoggingService,
): IEventController {
  return new EventController(service, logger);
}

