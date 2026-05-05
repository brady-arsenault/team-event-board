import { CreateRsvpService } from "../../src/rsvp/RsvpService";
import type {
  IEventRepository,
  IRsvpRepository,
} from "../../src/contracts";
import { silentLogger } from "../helpers/buildTestApp";
import {
  makeActingUser,
  makeEvent,
  makeRsvp,
  USER_IDS,
} from "./helpers/fixtures";

/**
 * Unit tests for Feature 4 — RSVP Toggle (`RsvpService.toggleRsvp`).
 *
 * Rule under test:
 *   "Members see an RSVP button on each event's detail page that reflects
 *    their current status. Clicking it toggles their attendance. If the event
 *    is full and the member is not already attending, they are placed on the
 *    waitlist instead. Organizers, admins, and anyone RSVPing to a cancelled
 *    or past event should be rejected."
 *
 * Both repositories are Jest mocks so the service is exercised in complete
 * isolation — no state leaks between tests.
 */
describe("RsvpService.toggleRsvp — unit", () => {
  function makeEventRepoMock(
    overrides: Partial<IEventRepository> = {},
  ): jest.Mocked<IEventRepository> {
    return {
      findById: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      ...overrides,
    } as jest.Mocked<IEventRepository>;
  }

  function makeRsvpRepoMock(
    overrides: Partial<IRsvpRepository> = {},
  ): jest.Mocked<IRsvpRepository> {
    return {
      findByEventAndUser: jest.fn(),
      findByEvent: jest.fn(),
      findByUser: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      countGoingByEvent: jest.fn(),
      ...overrides,
    } as jest.Mocked<IRsvpRepository>;
  }

  describe("event lookup", () => {
    it("returns EventNotFoundError when the event does not exist", async () => {
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(null);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp("nope", makeActingUser());

      expect(eventRepo.findById).toHaveBeenCalledWith("nope");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotFoundError");
      }
      expect(rsvpRepo.findByEventAndUser).not.toHaveBeenCalled();
      expect(rsvpRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("rejected event states", () => {
    it("rejects RSVPs to a cancelled event with InvalidStateError", async () => {
      const event = makeEvent({ status: "cancelled" });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("InvalidStateError");
        expect(result.value.message).toMatch(/cancelled|no longer/i);
      }
      expect(rsvpRepo.findByEventAndUser).not.toHaveBeenCalled();
    });

    it("rejects RSVPs to an event whose status is 'past'", async () => {
      const event = makeEvent({ status: "past" });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("InvalidStateError");
      }
    });

    it("rejects RSVPs whose startAt is already in the past even if status is 'published'", async () => {
      const event = makeEvent({
        status: "published",
        startAt: new Date("2000-01-01T00:00:00Z"),
        endAt: new Date("2000-01-01T02:00:00Z"),
      });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("InvalidStateError");
      }
    });

    it("does not create or update any RSVP when the event is rejected", async () => {
      const event = makeEvent({ status: "cancelled" });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      await service.toggleRsvp(event.id, makeActingUser());

      expect(rsvpRepo.create).not.toHaveBeenCalled();
      expect(rsvpRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("new RSVPs on an eligible event", () => {
    it("creates a 'going' RSVP when the member has never RSVP'd and there is capacity", async () => {
      const event = makeEvent({ capacity: 10 });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(null);
      rsvpRepo.countGoingByEvent.mockResolvedValue(3);
      rsvpRepo.create.mockImplementation(async (rsvp) => rsvp);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(
        event.id,
        makeActingUser({ userId: USER_IDS.reader }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("going");
        expect(result.value.eventId).toBe(event.id);
        expect(result.value.userId).toBe(USER_IDS.reader);
      }
      expect(rsvpRepo.create).toHaveBeenCalledTimes(1);
      expect(rsvpRepo.update).not.toHaveBeenCalled();
    });

    it("creates a 'waitlisted' RSVP when the event is full (going count === capacity)", async () => {
      const event = makeEvent({ capacity: 5 });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(null);
      rsvpRepo.countGoingByEvent.mockResolvedValue(5);
      rsvpRepo.create.mockImplementation(async (rsvp) => rsvp);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("waitlisted");
      expect(rsvpRepo.create).toHaveBeenCalledTimes(1);
    });

    it("creates a 'waitlisted' RSVP when the event is over-capacity", async () => {
      const event = makeEvent({ capacity: 5 });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(null);
      rsvpRepo.countGoingByEvent.mockResolvedValue(6);
      rsvpRepo.create.mockImplementation(async (rsvp) => rsvp);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("waitlisted");
    });

    it("creates a 'going' RSVP when capacity is null (unlimited) regardless of going count", async () => {
      const event = makeEvent({ capacity: null });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(null);
      rsvpRepo.countGoingByEvent.mockResolvedValue(10_000);
      rsvpRepo.create.mockImplementation(async (rsvp) => rsvp);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("going");
    });

    it("stamps createdAt and updatedAt to the same instant on a new RSVP", async () => {
      const event = makeEvent({ capacity: 10 });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(null);
      rsvpRepo.countGoingByEvent.mockResolvedValue(0);
      rsvpRepo.create.mockImplementation(async (rsvp) => rsvp);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.createdAt).toBeInstanceOf(Date);
        expect(result.value.updatedAt).toBeInstanceOf(Date);
        expect(result.value.createdAt.getTime()).toBe(
          result.value.updatedAt.getTime(),
        );
      }
    });
  });

  describe("toggling an active RSVP off (going/waitlisted -> cancelled)", () => {
    it("cancels a 'going' RSVP when clicked again", async () => {
      const event = makeEvent({ capacity: 10 });
      const existing = makeRsvp({
        eventId: event.id,
        userId: USER_IDS.reader,
        status: "going",
      });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(existing);
      rsvpRepo.update.mockImplementation(async (id, changes) => ({
        ...existing,
        ...changes,
      }));
      // Empty waitlist — the promote-on-cancel path is a no-op.
      rsvpRepo.findByEvent.mockResolvedValue([{ ...existing, status: "cancelled" }]);
      rsvpRepo.countGoingByEvent.mockResolvedValue(0);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("cancelled");
      expect(rsvpRepo.update).toHaveBeenCalledWith(
        existing.id,
        expect.objectContaining({ status: "cancelled" }),
      );
      expect(rsvpRepo.create).not.toHaveBeenCalled();
    });

    it("promotes the oldest waitlisted RSVP when a 'going' RSVP cancels and a spot frees up", async () => {
      const event = makeEvent({ capacity: 2 });
      const cancelling = makeRsvp({
        id: "rsvp-going",
        eventId: event.id,
        userId: USER_IDS.reader,
        status: "going",
      });
      const olderWaitlisted = makeRsvp({
        id: "rsvp-waitlisted-older",
        eventId: event.id,
        userId: "user-older",
        status: "waitlisted",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      const newerWaitlisted = makeRsvp({
        id: "rsvp-waitlisted-newer",
        eventId: event.id,
        userId: "user-newer",
        status: "waitlisted",
        createdAt: new Date("2026-02-01T00:00:00Z"),
      });

      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(cancelling);
      rsvpRepo.update.mockImplementation(async (id, changes) => ({
        ...cancelling,
        id,
        ...changes,
      }));
      rsvpRepo.findByEvent.mockResolvedValue([
        { ...cancelling, status: "cancelled" },
        olderWaitlisted,
        newerWaitlisted,
      ]);
      rsvpRepo.countGoingByEvent.mockResolvedValue(1);

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      expect(rsvpRepo.update).toHaveBeenCalledWith(
        cancelling.id,
        expect.objectContaining({ status: "cancelled" }),
      );
      expect(rsvpRepo.update).toHaveBeenCalledWith(
        olderWaitlisted.id,
        expect.objectContaining({ status: "going" }),
      );
      expect(rsvpRepo.update).not.toHaveBeenCalledWith(
        newerWaitlisted.id,
        expect.anything(),
      );
    });

    it("does not promote when capacity is unlimited", async () => {
      const event = makeEvent({ capacity: null });
      const cancelling = makeRsvp({
        eventId: event.id,
        userId: USER_IDS.reader,
        status: "going",
      });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(cancelling);
      rsvpRepo.update.mockImplementation(async (id, changes) => ({
        ...cancelling,
        id,
        ...changes,
      }));

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      await service.toggleRsvp(event.id, makeActingUser());

      expect(rsvpRepo.findByEvent).not.toHaveBeenCalled();
      expect(rsvpRepo.countGoingByEvent).not.toHaveBeenCalled();
    });

    it("does not promote when cancelling a 'waitlisted' RSVP (no spot freed)", async () => {
      const event = makeEvent({ capacity: 2 });
      const cancelling = makeRsvp({
        eventId: event.id,
        userId: USER_IDS.reader,
        status: "waitlisted",
      });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(cancelling);
      rsvpRepo.update.mockImplementation(async (id, changes) => ({
        ...cancelling,
        id,
        ...changes,
      }));

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      await service.toggleRsvp(event.id, makeActingUser());

      expect(rsvpRepo.findByEvent).not.toHaveBeenCalled();
      expect(rsvpRepo.countGoingByEvent).not.toHaveBeenCalled();
    });

    it("cancels a 'waitlisted' RSVP when clicked again", async () => {
      const event = makeEvent();
      const existing = makeRsvp({
        eventId: event.id,
        userId: USER_IDS.reader,
        status: "waitlisted",
      });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(existing);
      rsvpRepo.update.mockImplementation(async (id, changes) => ({
        ...existing,
        ...changes,
      }));

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("cancelled");
      expect(rsvpRepo.update).toHaveBeenCalledWith(
        existing.id,
        expect.objectContaining({ status: "cancelled" }),
      );
    });
  });

  describe("re-activating a previously cancelled RSVP", () => {
    it("re-activates as 'going' when there is still capacity", async () => {
      const event = makeEvent({ capacity: 10 });
      const existing = makeRsvp({
        eventId: event.id,
        userId: USER_IDS.reader,
        status: "cancelled",
      });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(existing);
      rsvpRepo.countGoingByEvent.mockResolvedValue(3);
      rsvpRepo.update.mockImplementation(async (id, changes) => ({
        ...existing,
        ...changes,
      }));

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("going");
      expect(rsvpRepo.create).not.toHaveBeenCalled();
      expect(rsvpRepo.update).toHaveBeenCalledWith(
        existing.id,
        expect.objectContaining({ status: "going" }),
      );
    });

    it("re-activates as 'waitlisted' when the event is now full", async () => {
      const event = makeEvent({ capacity: 5 });
      const existing = makeRsvp({
        eventId: event.id,
        userId: USER_IDS.reader,
        status: "cancelled",
      });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(existing);
      rsvpRepo.countGoingByEvent.mockResolvedValue(5);
      rsvpRepo.update.mockImplementation(async (id, changes) => ({
        ...existing,
        ...changes,
      }));

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const result = await service.toggleRsvp(event.id, makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("waitlisted");
    });
  });

  describe("concurrency", () => {
    it("serializes concurrent toggles on the same event so the last spot is not double-allocated", async () => {
      const event = makeEvent({ capacity: 1 });
      const eventRepo = makeEventRepoMock();
      const rsvpRepo = makeRsvpRepoMock();
      eventRepo.findById.mockResolvedValue(event);
      rsvpRepo.findByEventAndUser.mockResolvedValue(null);

      // Track the running "going" count as a true source of state, like a
      // database would. Each call to countGoingByEvent reflects the number
      // of "going" RSVPs created so far. If toggleRsvp is properly serialized,
      // the second caller must observe the first caller's write.
      const created: Array<{ id: string; status: string }> = [];
      rsvpRepo.countGoingByEvent.mockImplementation(async () => {
        return created.filter((r) => r.status === "going").length;
      });
      rsvpRepo.create.mockImplementation(async (rsvp) => {
        created.push({ id: rsvp.id, status: rsvp.status });
        return rsvp;
      });

      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());

      const [first, second] = await Promise.all([
        service.toggleRsvp(event.id, makeActingUser({ userId: "user-a" })),
        service.toggleRsvp(event.id, makeActingUser({ userId: "user-b" })),
      ]);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      const statuses = [first, second]
        .map((r) => (r.ok ? r.value.status : null))
        .filter((s): s is string => s !== null)
        .sort();
      expect(statuses).toEqual(["going", "waitlisted"]);
    });
  });

  describe("capacity boundary", () => {
    it.each([
      { goingCount: 0, expected: "going" },
      { goingCount: 4, expected: "going" },
      { goingCount: 5, expected: "waitlisted" },
      { goingCount: 100, expected: "waitlisted" },
    ])(
      "with capacity=5 and goingCount=$goingCount, new RSVP becomes '$expected'",
      async ({ goingCount, expected }) => {
        const event = makeEvent({ capacity: 5 });
        const eventRepo = makeEventRepoMock();
        const rsvpRepo = makeRsvpRepoMock();
        eventRepo.findById.mockResolvedValue(event);
        rsvpRepo.findByEventAndUser.mockResolvedValue(null);
        rsvpRepo.countGoingByEvent.mockResolvedValue(goingCount);
        rsvpRepo.create.mockImplementation(async (rsvp) => rsvp);

        const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
        const result = await service.toggleRsvp(event.id, makeActingUser());

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.status).toBe(expected);
      },
    );
  });
});
