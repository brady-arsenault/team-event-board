import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import { CreateEventController } from "./controller";
import type { IApp } from "./contracts";
import { CreateEventSearchController } from "./events/EventSearchController";
import { CreateEventSearchService } from "./events/EventSearchService";
import { CreateInMemoryEventRepository } from "./repository/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "./repository/InMemoryRsvpRepository";
import { CreateRsvpController } from "./rsvp/RsvpController";
import { CreateRsvpService } from "./rsvp/RsvpService";
import { CreateEventService } from "./service";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";

export function createComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  // Authentication & authorization wiring
  const authUsers = CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger);

  const eventRepository = CreateInMemoryEventRepository();
  const rsvpRepository = CreateInMemoryRsvpRepository();

  const eventService = CreateEventService(eventRepository, resolvedLogger);
  const eventController = CreateEventController(eventService, resolvedLogger);

  // Feature 7 — My RSVPs Dashboard
  const rsvpService = CreateRsvpService(eventRepository, rsvpRepository, resolvedLogger);
  const rsvpController = CreateRsvpController(rsvpService, resolvedLogger);

  // Feature 10 — Event Search
  const eventSearchService = CreateEventSearchService(eventRepository);
  const eventSearchController = CreateEventSearchController(eventSearchService, resolvedLogger);

  return CreateApp(
    authController,
    resolvedLogger,
    eventController,
    eventService,
    rsvpController,
    eventSearchController,
  );
}