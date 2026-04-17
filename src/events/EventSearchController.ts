import type { Response } from "express";
import type { ILoggingService } from "../service/LoggingService";
import {
  getAuthenticatedUser,
  touchAppSession,
  type AppSessionStore,
} from "../session/AppSession";
import type { IEventSearchService } from "./EventSearchService";

export interface IEventSearchController {
  showSearch(
    res: Response,
    store: AppSessionStore,
    query: string,
    isHtmx: boolean,
  ): Promise<void>;
}

class EventSearchController implements IEventSearchController {
  constructor(
    private readonly service: IEventSearchService,
    private readonly logger: ILoggingService,
  ) {}

  async showSearch(
    res: Response,
    store: AppSessionStore,
    query: string,
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

    const result = await this.service.searchEvents({ query });

    if (result.ok === false) {
      this.logger.warn(`Event search failed: ${result.value.message}`);
      const status = 400;
      if (isHtmx) {
        res.status(status).render("partials/error", {
          message: result.value.message,
          layout: false,
        });
        return;
      }
      res.status(status).render("events/search", {
        session,
        query,
        events: [],
        pageError: result.value.message,
      });
      return;
    }

    if (isHtmx) {
      res.render("events/partials/search-results", {
        events: result.value,
        query,
        layout: false,
      });
      return;
    }

    res.render("events/search", {
      session,
      query,
      events: result.value,
      pageError: null,
    });
  }
}

export function CreateEventSearchController(
  service: IEventSearchService,
  logger: ILoggingService,
): IEventSearchController {
  return new EventSearchController(service, logger);
}
