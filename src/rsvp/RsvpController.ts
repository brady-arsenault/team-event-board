import type { Response } from "express";
import type { IRsvpService } from "../contracts";
import type { ILoggingService } from "../service/LoggingService";
import {
  getAuthenticatedUser,
  touchAppSession,
  type AppSessionStore,
} from "../session/AppSession";

export interface IRsvpController {
  showDashboard(res: Response, store: AppSessionStore): Promise<void>;
}

class RsvpController implements IRsvpController {
  constructor(
    private readonly service: IRsvpService,
    private readonly logger: ILoggingService,
  ) {}

  async showDashboard(res: Response, store: AppSessionStore): Promise<void> {
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
