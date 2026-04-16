import type { Response } from "express";
import type { ILoggingService } from "./service/LoggingService";
import type { IEventService, CreateEventInput, ListEventsFilter } from "./contracts";
import {
  getAuthenticatedUser,
  touchAppSession,
  type AppSessionStore,
} from "./session/AppSession";

export interface IEventController {
  showCreateEventForm(res: Response, store: AppSessionStore): Promise<void>;
  createEventFromForm(
    res: Response,
    input: CreateEventInput,
    store: AppSessionStore,
  ): Promise<void>;
  showHome(
    res: Response,
    filter: ListEventsFilter,
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

  async showHome(
    res: Response,
    filter: ListEventsFilter,
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
    });
  }
}

export function CreateEventController(
  service: IEventService,
  logger: ILoggingService,
): IEventController {
  return new EventController(service, logger);
}
