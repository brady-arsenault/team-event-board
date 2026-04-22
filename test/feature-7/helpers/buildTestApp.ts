import type {
  IApp,
  IEventRepository,
  IRsvpRepository,
} from "../../../src/contracts";
import type { ILoggingService } from "../../../src/service/LoggingService";
import { CreateApp } from "../../../src/app";
import { CreateAdminUserService } from "../../../src/auth/AdminUserService";
import { CreateAuthController } from "../../../src/auth/AuthController";
import { CreateAuthService } from "../../../src/auth/AuthService";
import { CreateInMemoryUserRepository } from "../../../src/auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "../../../src/auth/PasswordHasher";
import { CreateEventController } from "../../../src/controller";
import { CreateEventSearchController } from "../../../src/events/EventSearchController";
import { CreateEventSearchService } from "../../../src/events/EventSearchService";
import { CreateInMemoryEventRepository } from "../../../src/repository/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "../../../src/repository/InMemoryRsvpRepository";
import { CreateRsvpController } from "../../../src/rsvp/RsvpController";
import { CreateRsvpService } from "../../../src/rsvp/RsvpService";
import { CreateEventService } from "../../../src/service";

export interface TestHarness {
  app: IApp;
  eventRepository: IEventRepository;
  rsvpRepository: IRsvpRepository;
}

export function silentLogger(): ILoggingService {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

export function buildTestApp(): TestHarness {
  const logger = silentLogger();
  const authUsers = CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(
    authService,
    adminUserService,
    logger,
  );

  const eventRepository = CreateInMemoryEventRepository();
  const rsvpRepository = CreateInMemoryRsvpRepository();

  const eventService = CreateEventService(eventRepository, logger);
  const eventController = CreateEventController(eventService, logger);

  const rsvpService = CreateRsvpService(
    eventRepository,
    rsvpRepository,
    logger,
  );
  const rsvpController = CreateRsvpController(rsvpService, logger);

  const eventSearchService = CreateEventSearchService(eventRepository);
  const eventSearchController = CreateEventSearchController(
    eventSearchService,
    logger,
  );

  const app = CreateApp(
    authController,
    logger,
    eventController,
    eventService,
    rsvpController,
    eventSearchController,
  );

  return { app, eventRepository, rsvpRepository };
}
