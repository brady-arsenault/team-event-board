import { randomUUID } from "node:crypto";
import type {
  EventStatus,
  IActingUser,
  IEvent,
} from "../../../../src/contracts";

export const USER_IDS = {
  admin: "user-admin",
  staff: "user-staff",
  reader: "user-reader",
} as const;

export const USER_EMAILS = {
  admin: "admin@app.test",
  staff: "staff@app.test",
  reader: "user@app.test",
} as const;

export const DEMO_PASSWORD = "password123";

export function makeActingUser(
  overrides: Partial<IActingUser> = {},
): IActingUser {
  return {
    userId: USER_IDS.admin,
    role: "admin",
    displayName: "Avery Admin",
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<IEvent> = {}): IEvent {
  const now = new Date("2026-05-01T12:00:00Z");
  const startAt = overrides.startAt ?? new Date("2026-06-01T18:00:00Z");
  const endAt = overrides.endAt ?? new Date("2026-06-01T20:00:00Z");
  return {
    id: overrides.id ?? randomUUID(),
    title: "Team Social",
    description: "A fun get-together for the team.",
    location: "Main Hall",
    category: "social",
    capacity: 25,
    status: "published" as EventStatus,
    startAt,
    endAt,
    organizerId: USER_IDS.staff,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
