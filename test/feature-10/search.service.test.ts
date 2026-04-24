import { CreateEventSearchService } from "../../src/events/EventSearchService";
import { CreateInMemoryEventRepository } from "../../src/repository/InMemoryEventRepository";
import type { IEventRepository } from "../../src/contracts";
import { daysFromNow, makeEvent } from "./helpers/fixtures";

describe("EventSearchService.searchEvents", () => {
  let eventRepository: IEventRepository;
  let service: ReturnType<typeof CreateEventSearchService>;

  beforeEach(() => {
    eventRepository = CreateInMemoryEventRepository();
    service = CreateEventSearchService(eventRepository);
  });

  describe("happy path", () => {
    it("returns all published upcoming events when the query is empty", async () => {
      await eventRepository.create(makeEvent({ title: "Hackathon", startAt: daysFromNow(2) }));
      await eventRepository.create(makeEvent({ title: "Library Tour", startAt: daysFromNow(5) }));

      const result = await service.searchEvents({ query: "" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(2);
      expect(result.value.map((e) => e.title)).toEqual(["Hackathon", "Library Tour"]);
    });

    it("matches by title, case-insensitively", async () => {
      await eventRepository.create(makeEvent({ title: "Spring Hackathon" }));
      await eventRepository.create(makeEvent({ title: "Book Club" }));

      const result = await service.searchEvents({ query: "HACKATHON" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Spring Hackathon");
    });

    it("matches by description substring", async () => {
      await eventRepository.create(
        makeEvent({ title: "Service Day", description: "Volunteering at the food bank." }),
      );
      await eventRepository.create(
        makeEvent({ title: "Movie Night", description: "Popcorn provided." }),
      );

      const result = await service.searchEvents({ query: "food" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Service Day");
    });

    it("matches by location substring", async () => {
      await eventRepository.create(
        makeEvent({ title: "Study Session", location: "Parks Library" }),
      );
      await eventRepository.create(
        makeEvent({ title: "Yoga", location: "Rec Center" }),
      );

      const result = await service.searchEvents({ query: "library" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].title).toBe("Study Session");
    });

    it("sorts results by startAt ascending", async () => {
      await eventRepository.create(makeEvent({ title: "Later Picnic", startAt: daysFromNow(10) }));
      await eventRepository.create(makeEvent({ title: "Early Picnic", startAt: daysFromNow(2) }));
      await eventRepository.create(makeEvent({ title: "Mid Picnic", startAt: daysFromNow(5) }));

      const result = await service.searchEvents({ query: "picnic" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value.map((e) => e.title)).toEqual([
        "Early Picnic",
        "Mid Picnic",
        "Later Picnic",
      ]);
    });
  });

  describe("filtering rules (published upcoming only)", () => {
    it("excludes draft events", async () => {
      await eventRepository.create(
        makeEvent({ title: "Draft Party", status: "draft" }),
      );

      const result = await service.searchEvents({ query: "" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(0);
    });

    it("excludes cancelled events", async () => {
      await eventRepository.create(
        makeEvent({ title: "Called Off", status: "cancelled" }),
      );

      const result = await service.searchEvents({ query: "" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(0);
    });

    it("excludes events whose startAt is in the past", async () => {
      await eventRepository.create(
        makeEvent({ title: "Yesterday Show", startAt: daysFromNow(-1) }),
      );

      const result = await service.searchEvents({ query: "" });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(0);
    });
  });

  describe("InvalidInputError", () => {
    it("returns Err InvalidInputError when query exceeds 500 characters", async () => {
      const query = "a".repeat(501);

      const result = await service.searchEvents({ query });

      expect(result.ok).toBe(false);
      if (result.ok === true) return;
      expect(result.value.name).toBe("InvalidInputError");
      expect(result.value.message).toMatch(/500/);
    });

    it("accepts a query exactly at the 500 character limit", async () => {
      const query = "a".repeat(500);

      const result = await service.searchEvents({ query });

      expect(result.ok).toBe(true);
    });
  });

  describe("edge case — whitespace-only query", () => {
    it("treats a whitespace-only query the same as empty (returns all published upcoming)", async () => {
      await eventRepository.create(makeEvent({ title: "Alpha" }));
      await eventRepository.create(makeEvent({ title: "Beta" }));

      const result = await service.searchEvents({ query: "   " });

      expect(result.ok).toBe(true);
      if (result.ok === false) return;
      expect(result.value).toHaveLength(2);
    });
  });
});
