import { CreateEventService } from "../../src/service";
import type { IEventRepository } from "../../src/contracts";
import { silentLogger } from "./helpers/buildTestApp";
import { makeActingUser, makeEvent, USER_IDS } from "./helpers/fixtures";

/**
 * Unit tests for the core rule that powers Feature 2 from the perspective of
 * the "admin" role:
 *
 *   "Any authenticated user can view a published event. Draft events are only
 *    visible to the organizer and to admins; all others get a not-found
 *    response."
 *
 * Admin is the privileged role: the draft-visibility rule includes an explicit
 * admin bypass — admins can view ANY draft, regardless of organizer. A missing
 * event still returns EventNotFoundError for admins (no resurrection).
 *
 * The service is tested in isolation — the IEventRepository is a Jest mock so
 * the pure domain logic of `getEventById` is all that is exercised here.
 */
describe("EventService.getEventById — admin role (unit)", () => {
  function makeRepoMock(
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

  describe("published events", () => {
    it("returns the event for an admin viewer who is not the organizer", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "published",
        organizerId: USER_IDS.staff,
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.admin, role: "admin" }),
      );

      expect(repo.findById).toHaveBeenCalledWith(event.id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(event);
    });

    it("returns the event for an admin viewer who is also the organizer", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "published",
        organizerId: USER_IDS.admin,
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.admin, role: "admin" }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.organizerId).toBe(USER_IDS.admin);
    });
  });

  describe("missing events", () => {
    it("returns EventNotFoundError even for an admin when the event does not exist", async () => {
      const repo = makeRepoMock();
      repo.findById.mockResolvedValue(null);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        "does-not-exist",
        makeActingUser({ userId: USER_IDS.admin, role: "admin" }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotFoundError");
        expect(result.value.message).toContain("does-not-exist");
      }
    });
  });

  describe("draft visibility rule — admin bypass", () => {
    it("allows an admin to view a draft organized by someone else", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "draft",
        organizerId: USER_IDS.staff,
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.admin, role: "admin" }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("draft");
    });

    it("allows an admin to view a draft they organized themselves", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "draft",
        organizerId: USER_IDS.admin,
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.admin, role: "admin" }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("draft");
    });
  });
});
