import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { CreateEventController } from "./controller";
import { CreateEventService } from "./service";
import { CreateInMemoryEventRepository } from "./repository/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "./repository/InMemoryRsvpRepository";
import { CreateRsvpService } from "./rsvp/RsvpService";
import { CreateRsvpController } from "./rsvp/RsvpController";
import { CreateEventSearchService } from "./events/EventSearchService";
import { CreateEventSearchController } from "./events/EventSearchController";

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

  // Feature 7 — My RSVPs Dashboard (Phan Ha)
  const rsvpService = CreateRsvpService(eventRepository, rsvpRepository, resolvedLogger);
  const rsvpController = CreateRsvpController(rsvpService, resolvedLogger);

  // Feature 10 — Event Search (Phan Ha)
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
