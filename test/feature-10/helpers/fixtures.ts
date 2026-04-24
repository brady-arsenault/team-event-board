import { randomUUID } from "node:crypto";
import type { IEvent } from "../../../src/contracts";

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

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

export function makeEvent(overrides: Partial<IEvent> = {}): IEvent {
  const startAt = overrides.startAt ?? daysFromNow(7);
  const endAt = overrides.endAt ?? new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  const createdAt = overrides.createdAt ?? new Date();
  return {
    id: overrides.id ?? randomUUID(),
    title: "Community Picnic",
    description: "A friendly get-together in the park.",
    location: "Riverside Park",
    category: "social",
    capacity: 40,
    status: "published",
    startAt,
    endAt,
    organizerId: USER_IDS.staff,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
