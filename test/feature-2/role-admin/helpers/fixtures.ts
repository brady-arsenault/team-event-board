import { randomUUID } from "node:crypto";
import type {
  EventStatus,
  IActingUser,
  IEvent,
} from "../../../../src/contracts";
import { USER_IDS } from "../../../helpers/constants";

export { USER_IDS, USER_EMAILS, DEMO_PASSWORD } from "../../../helpers/constants";

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
