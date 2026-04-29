import type { PrismaClient } from "@prisma/client";
import type {
  IApp,
  IEventRepository,
  IRsvpRepository,
} from "../../src/contracts";
import type { ILoggingService } from "../../src/service/LoggingService";
import { CreateApp } from "../../src/app";
import { CreateAdminUserService } from "../../src/auth/AdminUserService";
import { CreateAuthController } from "../../src/auth/AuthController";
import { CreateAuthService } from "../../src/auth/AuthService";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "../../src/auth/PasswordHasher";
import { CreatePrismaUserRepository } from "../../src/auth/PrismaUserRepository";
import { CreateEventController } from "../../src/controller";
import { CreateEventSearchController } from "../../src/events/EventSearchController";
import { CreateEventSearchService } from "../../src/events/EventSearchService";
import { CreateInMemoryEventRepository } from "../../src/repository/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "../../src/repository/InMemoryRsvpRepository";
import { CreatePrismaEventRepository } from "../../src/repository/PrismaEventRepository";
import { CreatePrismaRsvpRepository } from "../../src/repository/PrismaRsvpRepository";
import {
  CreateRsvpController,
  type IRsvpController,
} from "../../src/rsvp/RsvpController";
import { CreateRsvpService } from "../../src/rsvp/RsvpService";
import { CreateEventService } from "../../src/service";
import type { IUserRepository } from "../../src/auth/UserRepository";

export interface TestHarness {
  app: IApp;
  eventRepository: IEventRepository;
  rsvpRepository: IRsvpRepository;
  rsvpController: IRsvpController;
}

export interface BuildTestAppConfig {
  /**
   * When provided, the harness wires Prisma-backed repositories against this
   * client (mirroring `composition.ts`). When omitted, in-memory repositories
   * are used — the legacy default for tests that don't need a real database.
   */
  prisma?: PrismaClient;
}

export function silentLogger(): ILoggingService {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

export function buildTestApp(config: BuildTestAppConfig = {}): TestHarness {
  const logger = silentLogger();
  const authUsers: IUserRepository = config.prisma
    ? CreatePrismaUserRepository(config.prisma)
    : CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(
    authService,
    adminUserService,
    logger,
  );

  const eventRepository: IEventRepository = config.prisma
    ? CreatePrismaEventRepository(config.prisma)
    : CreateInMemoryEventRepository();
  const rsvpRepository: IRsvpRepository = config.prisma
    ? CreatePrismaRsvpRepository(config.prisma)
    : CreateInMemoryRsvpRepository();

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

  return { app, eventRepository, rsvpRepository, rsvpController };
}
