import { CreateEventService } from "../../../src/service";
import type { IEventRepository } from "../../../src/contracts";
import { silentLogger } from "./helpers/buildTestApp";
import { makeActingUser, makeEvent, USER_IDS } from "./helpers/fixtures";

/**
 * Unit tests for the core rule that powers Feature 2 from the perspective of
 * the "staff" role:
 *
 *   "Any authenticated user can view a published event. Draft events are only
 *    visible to the organizer and to admins; all others get a not-found
 *    response."
 *
 * Staff is a non-admin role — so the draft-visibility rule applies normally:
 *   - Staff user who IS the organizer: can view the draft.
 *   - Staff user who is NOT the organizer: UnauthorizedError (no admin bypass).
 *
 * The service is tested in isolation — the IEventRepository is a Jest mock so
 * the pure domain logic of `getEventById` is all that is exercised here.
 */
describe("EventService.getEventById — staff role (unit)", () => {
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
    it("returns the event for an authenticated staff viewer who is not the organizer", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "published",
        organizerId: "some-other-user",
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.staff, role: "staff" }),
      );

      expect(repo.findById).toHaveBeenCalledWith(event.id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(event);
    });

    it("returns the event for a staff viewer who is also the organizer", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "published",
        organizerId: USER_IDS.staff,
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.staff, role: "staff" }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.organizerId).toBe(USER_IDS.staff);
    });
  });

  describe("missing events", () => {
    it("returns EventNotFoundError when the repository has no such id", async () => {
      const repo = makeRepoMock();
      repo.findById.mockResolvedValue(null);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        "does-not-exist",
        makeActingUser({ userId: USER_IDS.staff, role: "staff" }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("EventNotFoundError");
        expect(result.value.message).toContain("does-not-exist");
      }
    });
  });

  describe("draft visibility rule", () => {
    it("allows a staff viewer to see a draft they organized", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "draft",
        organizerId: USER_IDS.staff,
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.staff, role: "staff" }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe("draft");
    });

    it("rejects a staff viewer who is not the organizer with UnauthorizedError", async () => {
      const repo = makeRepoMock();
      const event = makeEvent({
        status: "draft",
        organizerId: "some-other-user",
      });
      repo.findById.mockResolvedValue(event);

      const service = CreateEventService(repo, silentLogger());
      const result = await service.getEventById(
        event.id,
        makeActingUser({ userId: USER_IDS.staff, role: "staff" }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.value.name).toBe("UnauthorizedError");
        expect(result.value.message).toMatch(/permission/i);
      }
    });
  });
});
