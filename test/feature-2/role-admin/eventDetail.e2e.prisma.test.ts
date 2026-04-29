import request from "supertest";
import { buildTestApp } from "../../helpers/buildTestApp";
import { setupPrismaTestDb, type PrismaTestDb } from "../../helpers/prismaTestDb";
import {
  DEMO_PASSWORD,
  USER_EMAILS,
  USER_IDS,
  makeEvent,
} from "./helpers/fixtures";
import type { IEvent, IEventRepository } from "../../../src/contracts";

/**
 * Prisma-backed mirror of `eventDetail.e2e.test.ts` for the "admin" role.
 */
describe("GET /events/:id/detail — admin role (e2e, Prisma)", () => {
  let db: PrismaTestDb;
  let agent: ReturnType<typeof request.agent>;
  let eventRepository: IEventRepository;
  let expressApp: ReturnType<
    ReturnType<typeof buildTestApp>["app"]["getExpressApp"]
  >;

  async function seedEvent(overrides: Partial<IEvent> = {}): Promise<IEvent> {
    return eventRepository.create(makeEvent(overrides));
  }

  async function loginAsAdmin(): Promise<void> {
    const res = await agent
      .post("/login")
      .type("form")
      .send({ email: USER_EMAILS.admin, password: DEMO_PASSWORD });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  }

  beforeAll(async () => {
    db = await setupPrismaTestDb();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await db.clearEventData();
    const harness = buildTestApp({ prisma: db.prisma });
    eventRepository = harness.eventRepository;
    expressApp = harness.app.getExpressApp();
    agent = request.agent(expressApp);
  });

  describe("unauthenticated access", () => {
    it("redirects to /login when no user is signed in", async () => {
      const event = await seedEvent({ status: "published" });

      const res = await request(expressApp).get(`/events/${event.id}/detail`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("returns 401 for an HTMX request when no user is signed in", async () => {
      const event = await seedEvent({ status: "published" });

      const res = await request(expressApp)
        .get(`/events/${event.id}/detail`)
        .set("HX-Request", "true");

      expect(res.status).toBe(401);
      expect(res.text).toMatch(/log in/i);
    });
  });

  describe("published events", () => {
    it("renders the full event detail and a Cancel control for an admin on a published event they did not organize", async () => {
      const event = await seedEvent({
        status: "published",
        title: "Spring Game Night",
        description: "Board games and snacks.",
        location: "Student Center 204",
        category: "social",
        capacity: 30,
        organizerId: USER_IDS.staff,
      });

      await loginAsAdmin();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(200);
      expect(res.text).toContain("Spring Game Night");
      expect(res.text).toContain("Board games and snacks.");
      expect(res.text).toContain("Student Center 204");
      expect(res.text).toContain("social");
      expect(res.text).toContain("30 spots");
      expect(res.text).toContain(USER_IDS.staff);
      expect(res.text).toContain("published");
      expect(res.text).toContain(`/events/${event.id}/cancel`);
      expect(res.text).not.toContain(`/events/edit/${event.id}`);
      expect(res.text).not.toContain(`/events/${event.id}/publish`);
      expect(res.text).toContain(`/events/${event.id}/rsvp`);
    });

    it("shows Edit and Cancel controls when an admin is also the organizer of a published event", async () => {
      const event = await seedEvent({
        status: "published",
        organizerId: USER_IDS.admin,
      });

      await loginAsAdmin();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(200);
      expect(res.text).toContain(`/events/edit/${event.id}`);
      expect(res.text).toContain(`/events/${event.id}/cancel`);
      expect(res.text).not.toContain(`/events/${event.id}/publish`);
    });

    it("renders 'Unlimited' when capacity is null", async () => {
      const event = await seedEvent({ status: "published", capacity: null });

      await loginAsAdmin();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(200);
      expect(res.text).toContain("Unlimited");
    });
  });

  describe("missing events", () => {
    it("returns 404 when the event id does not exist, even for an admin", async () => {
      await loginAsAdmin();

      const res = await agent.get("/events/does-not-exist/detail");

      expect(res.status).toBe(404);
      expect(res.text).toMatch(/not found/i);
    });
  });

  describe("draft visibility rule — admin bypass", () => {
    it("shows a draft to an admin who is not the organizer", async () => {
      const event = await seedEvent({
        status: "draft",
        organizerId: USER_IDS.staff,
      });

      await loginAsAdmin();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(200);
      expect(res.text).toContain(event.title);
      expect(res.text).toContain("draft");
      expect(res.text).not.toContain(`/events/${event.id}/cancel`);
      expect(res.text).not.toContain(`/events/${event.id}/publish`);
      expect(res.text).not.toContain(`/events/edit/${event.id}`);
    });

    it("shows a draft with Publish and Edit controls to an admin who is the organizer", async () => {
      const event = await seedEvent({
        status: "draft",
        organizerId: USER_IDS.admin,
      });

      await loginAsAdmin();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(200);
      expect(res.text).toContain(event.title);
      expect(res.text).toContain("draft");
      expect(res.text).toContain(`/events/${event.id}/publish`);
      expect(res.text).toContain(`/events/edit/${event.id}`);
      expect(res.text).not.toContain(`/events/${event.id}/cancel`);
    });
  });
});
