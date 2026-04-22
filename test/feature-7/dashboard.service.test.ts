import { CreateInMemoryEventRepository } from "../../src/repository/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "../../src/repository/InMemoryRsvpRepository";
import { CreateRsvpService } from "../../src/rsvp/RsvpService";
import type { IEventRepository, IRsvpRepository } from "../../src/contracts";
import { silentLogger } from "./helpers/buildTestApp";
import {
  USER_IDS,
  daysFromNow,
  makeActingUser,
  makeEvent,
  makeRsvp,
} from "./helpers/fixtures";

describe("RsvpService.getUserRsvps", () => {
  let eventRepository: IEventRepository;
  let rsvpRepository: IRsvpRepository;
  let service: ReturnType<typeof CreateRsvpService>;

  beforeEach(() => {
    eventRepository = CreateInMemoryEventRepository();
    rsvpRepository = CreateInMemoryRsvpRepository();
    service = CreateRsvpService(eventRepository, rsvpRepository, silentLogger());
  });

  describe("UnauthorizedError", () => {
    it("returns UnauthorizedError when the acting user has the admin role", async () => {
      const result = await service.getUserRsvps(
        makeActingUser({ userId: USER_IDS.admin, role: "admin" }),
      );

      expect(result.ok).toBe(false);
      if (result.ok === true) return;
      expect(result.value.name).toBe("UnauthorizedError");
    });

    it("returns UnauthorizedError when the acting user has the staff role", async () => {
      const result = await service.getUserRsvps(
        makeActingUser({ userId: USER_IDS.staff, role: "staff" }),
      );

      expect(result.ok).toBe(false);
      if (result.ok === true) return;
      expect(result.value.name).toBe("UnauthorizedError");
    });
  });

  describe("empty dashboard", () => {
    it("returns empty upcoming and past lists when the user has no RSVPs", async () => {
      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toEqual([]);
      expect(result.value.past).toEqual([]);
    });
  });

  describe("upcoming list", () => {
    it("groups a going RSVP on a published future event into upcoming", async () => {
      const event = await eventRepository.create(
        makeEvent({ title: "Team Picnic", startAt: daysFromNow(5) }),
      );
      await rsvpRepository.create(makeRsvp(event.id, { status: "going" }));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(1);
      expect(result.value.upcoming[0].event.title).toBe("Team Picnic");
      expect(result.value.past).toHaveLength(0);
    });

    it("groups a waitlisted RSVP on a published future event into upcoming", async () => {
      const event = await eventRepository.create(makeEvent());
      await rsvpRepository.create(makeRsvp(event.id, { status: "waitlisted" }));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(1);
      expect(result.value.upcoming[0].rsvp.status).toBe("waitlisted");
    });

    it("sorts upcoming entries by event startAt ascending", async () => {
      const later = await eventRepository.create(
        makeEvent({ title: "Later", startAt: daysFromNow(10) }),
      );
      const soon = await eventRepository.create(
        makeEvent({ title: "Soon", startAt: daysFromNow(2) }),
      );
      const middle = await eventRepository.create(
        makeEvent({ title: "Middle", startAt: daysFromNow(5) }),
      );
      await rsvpRepository.create(makeRsvp(later.id));
      await rsvpRepository.create(makeRsvp(soon.id));
      await rsvpRepository.create(makeRsvp(middle.id));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming.map((i) => i.event.title)).toEqual([
        "Soon",
        "Middle",
        "Later",
      ]);
    });
  });

  describe("past list", () => {
    it("places a cancelled RSVP into past regardless of event status", async () => {
      const event = await eventRepository.create(
        makeEvent({ title: "Cancelled My RSVP", startAt: daysFromNow(5) }),
      );
      await rsvpRepository.create(makeRsvp(event.id, { status: "cancelled" }));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(0);
      expect(result.value.past).toHaveLength(1);
      expect(result.value.past[0].rsvp.status).toBe("cancelled");
    });

    it("places a going RSVP on a cancelled event into past", async () => {
      const event = await eventRepository.create(
        makeEvent({ status: "cancelled" }),
      );
      await rsvpRepository.create(makeRsvp(event.id, { status: "going" }));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(0);
      expect(result.value.past).toHaveLength(1);
      expect(result.value.past[0].event.status).toBe("cancelled");
    });

    it("places a going RSVP on an event whose startAt has passed into past", async () => {
      const event = await eventRepository.create(
        makeEvent({ startAt: daysFromNow(-1) }),
      );
      await rsvpRepository.create(makeRsvp(event.id, { status: "going" }));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(0);
      expect(result.value.past).toHaveLength(1);
    });

    it("places a going RSVP on a draft event into past", async () => {
      const event = await eventRepository.create(
        makeEvent({ status: "draft" }),
      );
      await rsvpRepository.create(makeRsvp(event.id, { status: "going" }));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(0);
      expect(result.value.past).toHaveLength(1);
    });

    it("sorts past entries by event startAt descending (most recent first)", async () => {
      const old = await eventRepository.create(
        makeEvent({
          title: "Old",
          status: "past",
          startAt: daysFromNow(-30),
        }),
      );
      const recent = await eventRepository.create(
        makeEvent({
          title: "Recent",
          status: "past",
          startAt: daysFromNow(-2),
        }),
      );
      const middle = await eventRepository.create(
        makeEvent({
          title: "Middle",
          status: "past",
          startAt: daysFromNow(-10),
        }),
      );
      await rsvpRepository.create(makeRsvp(old.id));
      await rsvpRepository.create(makeRsvp(recent.id));
      await rsvpRepository.create(makeRsvp(middle.id));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.past.map((i) => i.event.title)).toEqual([
        "Recent",
        "Middle",
        "Old",
      ]);
    });
  });

  describe("mixed dashboard", () => {
    it("splits RSVPs across upcoming and past correctly", async () => {
      const future = await eventRepository.create(
        makeEvent({ title: "Future Event", startAt: daysFromNow(3) }),
      );
      const pastEvent = await eventRepository.create(
        makeEvent({
          title: "Past Event",
          status: "past",
          startAt: daysFromNow(-5),
        }),
      );
      await rsvpRepository.create(makeRsvp(future.id, { status: "going" }));
      await rsvpRepository.create(makeRsvp(pastEvent.id, { status: "going" }));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(1);
      expect(result.value.upcoming[0].event.title).toBe("Future Event");
      expect(result.value.past).toHaveLength(1);
      expect(result.value.past[0].event.title).toBe("Past Event");
    });
  });

  describe("edge case — orphaned RSVPs are skipped silently", () => {
    it("skips RSVPs whose referenced event no longer exists in the repository", async () => {
      const event = await eventRepository.create(makeEvent({ title: "Real Event" }));
      await rsvpRepository.create(makeRsvp(event.id));
      // Orphaned RSVP: references a non-existent event id.
      await rsvpRepository.create(makeRsvp("event-that-does-not-exist"));

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(1);
      expect(result.value.past).toHaveLength(0);
    });

    it("only returns RSVPs belonging to the acting user, not other users", async () => {
      const event = await eventRepository.create(makeEvent());
      await rsvpRepository.create(makeRsvp(event.id)); // Belongs to reader
      await rsvpRepository.create(
        makeRsvp(event.id, { userId: USER_IDS.staff }), // Belongs to someone else
      );

      const result = await service.getUserRsvps(makeActingUser());

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.upcoming).toHaveLength(1);
      expect(result.value.upcoming[0].rsvp.userId).toBe(USER_IDS.reader);
    });
  });
});
