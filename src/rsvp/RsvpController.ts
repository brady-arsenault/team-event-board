import type { Response } from "express";
import type { IRsvpService } from "../contracts";
import type { ILoggingService } from "../service/LoggingService";
import {
  getAuthenticatedUser,
  touchAppSession,
  type AppSessionStore,
} from "../session/AppSession";

export interface IRsvpController {
  showRsvpButton(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  handleToggleRsvp(res: Response, eventId: string, store: AppSessionStore): Promise<void>;
  showDashboard(
    res: Response,
    store: AppSessionStore,
    isHtmx: boolean,
  ): Promise<void>;
}

class RsvpController implements IRsvpController {
  constructor(
    private readonly service: IRsvpService,
    private readonly logger: ILoggingService,
  ) {}

  async showRsvpButton(res: Response, eventId: string, store: AppSessionStore): Promise<void> {
    const currentUser = getAuthenticatedUser(store);
    if (!currentUser) {
      res.status(401).render("partials/error", { message: "Please log in to continue.", layout: false });
      return;
    }

    const result = await this.service.getEventRsvp(eventId, {
      userId: currentUser.userId,
      role: currentUser.role,
      displayName: currentUser.displayName,
    });

    if (result.ok === false) {
      this.logger.warn(`Get event RSVP failed: ${result.value.message}`);
      res.status(404).render("partials/error", { message: result.value.message, layout: false });
      return;
    }

    res.render("rsvp/button", { eventId, rsvp: result.value, layout: false });
  }

  async handleToggleRsvp(res: Response, eventId: string, store: AppSessionStore): Promise<void> {
    const currentUser = getAuthenticatedUser(store);
    if (!currentUser) {
      res.status(401).render("partials/error", { message: "Please log in to continue.", layout: false });
      return;
    }

    const result = await this.service.toggleRsvp(eventId, {
      userId: currentUser.userId,
      role: currentUser.role,
      displayName: currentUser.displayName,
    });

    if (result.ok === false) {
      this.logger.warn(`Toggle RSVP failed: ${result.value.message}`);
      const status = result.value.name === "EventNotFoundError" ? 404
        : result.value.name === "UnauthorizedError" ? 403
        : 400;
      res.status(status).render("partials/error", { message: result.value.message, layout: false });
      return;
    }

    res.render("rsvp/button", { eventId, rsvp: result.value, layout: false });
  }

  async showDashboard(
    res: Response,
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

    const result = await this.service.getUserRsvps({
      userId: currentUser.userId,
      role: currentUser.role,
      displayName: currentUser.displayName,
    });

    if (result.ok === false) {
      this.logger.warn(`Show RSVP dashboard failed: ${result.value.message}`);
      res.status(403).render("partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    if (isHtmx) {
      res.render("rsvp/partials/dashboard-content", {
        upcoming: result.value.upcoming,
        past: result.value.past,
        layout: false,
      });
      return;
    }

    res.render("rsvp/dashboard", {
      session,
      upcoming: result.value.upcoming,
      past: result.value.past,
      pageError: null,
    });
  }
}

export function CreateRsvpController(
  service: IRsvpService,
  logger: ILoggingService,
): IRsvpController {
  return new RsvpController(service, logger);
}
