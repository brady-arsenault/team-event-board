import type { PrismaClient } from "@prisma/client";
import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreatePrismaUserRepository } from "./auth/PrismaUserRepository";
import { CreateApp } from "./app";
import { CreateEventController } from "./controller";
import type { IApp, IEventRepository, IRsvpRepository } from "./contracts";
import { CreateEventSearchController } from "./events/EventSearchController";
import { CreateEventSearchService } from "./events/EventSearchService";
import { CreateInMemoryEventRepository } from "./repository/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "./repository/InMemoryRsvpRepository";
import { CreatePrismaEventRepository } from "./repository/PrismaEventRepository";
import { CreatePrismaRsvpRepository } from "./repository/PrismaRsvpRepository";
import { CreateRsvpController } from "./rsvp/RsvpController";
import { CreateRsvpService } from "./rsvp/RsvpService";
import { CreateEventService } from "./service";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import type { IUserRepository } from "./auth/UserRepository";

export interface ComposedAppConfig {
  /**
   * Logging service to inject. Defaults to the standard console logger.
   */
  logger?: ILoggingService;
  /**
   * Prisma client to back the Event/Rsvp/User repositories. When provided, the
   * app uses the Prisma-backed repositories (Sprint 3 production wiring). When
   * omitted, the app falls back to in-memory repositories (used by the
   * existing Sprint 2 unit/integration/e2e tests, which assume a clean store
   * per `createComposedApp()` call).
   */
  prisma?: PrismaClient;
}

/**
 * Wire the application graph.
 *
 * The composition root is the only place that knows which concrete repository
 * implementation backs each service. Sprint 3 swaps the data layer here: pass
 * a Prisma client to use the database, or omit it to keep using in-memory
 * arrays for tests.
 *
 * The 4-layer architecture (Route → Controller → Service → Repository) means
 * controllers and services see the same `IEventRepository` / `IRsvpRepository`
 * / `IUserRepository` interfaces regardless of the backing store.
 */
export function createComposedApp(config: ComposedAppConfig = {}): IApp {
  const resolvedLogger = config.logger ?? CreateLoggingService();

  const eventRepository: IEventRepository = config.prisma
    ? CreatePrismaEventRepository(config.prisma)
    : CreateInMemoryEventRepository();
  const rsvpRepository: IRsvpRepository = config.prisma
    ? CreatePrismaRsvpRepository(config.prisma)
    : CreateInMemoryRsvpRepository();
  const authUsers: IUserRepository = config.prisma
    ? CreatePrismaUserRepository(config.prisma)
    : CreateInMemoryUserRepository();

  // Authentication & authorization wiring
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger);

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
