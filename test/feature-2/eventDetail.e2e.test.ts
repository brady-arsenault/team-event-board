import request from "supertest";
import { buildTestApp } from "./helpers/buildTestApp";
import {
  DEMO_PASSWORD,
  USER_EMAILS,
  USER_IDS,
  makeEvent,
} from "./helpers/fixtures";
import type { IEvent, IEventRepository } from "../../src/contracts";

/**
 * End-to-end tests for Feature 2 from the perspective of the "user" (member)
 * role. We drive the full Express stack with supertest: log in through
 * POST /login to establish a real session cookie, then issue
 * GET /events/:id/detail and inspect the rendered HTML.
 */
describe("GET /events/:id/detail — user role (e2e)", () => {
  let agent: ReturnType<typeof request.agent>;
  let eventRepository: IEventRepository;
  let expressApp: ReturnType<
    ReturnType<typeof buildTestApp>["app"]["getExpressApp"]
  >;

  async function seedEvent(overrides: Partial<IEvent> = {}): Promise<IEvent> {
    return eventRepository.create(makeEvent(overrides));
  }

  async function loginAsMember(): Promise<void> {
    const res = await agent
      .post("/login")
      .type("form")
      .send({ email: USER_EMAILS.reader, password: DEMO_PASSWORD });
    // The login handler redirects to "/" on success.
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  }

  beforeEach(() => {
    const harness = buildTestApp();
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
    it("renders the full event detail for an authenticated member", async () => {
      const event = await seedEvent({
        status: "published",
        title: "Spring Game Night",
        description: "Board games and snacks.",
        location: "Student Center 204",
        category: "social",
        capacity: 30,
        organizerId: USER_IDS.staff,
      });

      await loginAsMember();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(200);
      // Title, description, location, category, capacity, organizer, status.
      expect(res.text).toContain("Spring Game Night");
      expect(res.text).toContain("Board games and snacks.");
      expect(res.text).toContain("Student Center 204");
      expect(res.text).toContain("social");
      expect(res.text).toContain("30 spots");
      expect(res.text).toContain(USER_IDS.staff);
      expect(res.text).toContain("published");
      // Members see the RSVP widget but no edit/cancel/publish controls.
      expect(res.text).toContain(`/events/${event.id}/rsvp`);
      expect(res.text).not.toContain(`/events/edit/${event.id}`);
      expect(res.text).not.toContain(`/events/${event.id}/cancel`);
      expect(res.text).not.toContain(`/events/${event.id}/publish`);
    });

    it("renders 'Unlimited' when capacity is null", async () => {
      const event = await seedEvent({ status: "published", capacity: null });

      await loginAsMember();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(200);
      expect(res.text).toContain("Unlimited");
    });
  });

  describe("missing events", () => {
    it("returns 404 when the event id does not exist", async () => {
      await loginAsMember();

      const res = await agent.get("/events/does-not-exist/detail");

      expect(res.status).toBe(404);
      expect(res.text).toMatch(/not found/i);
    });
  });

  describe("draft visibility rule", () => {
    it("returns 403 when a non-organizer member requests a draft", async () => {
      const event = await seedEvent({
        status: "draft",
        organizerId: USER_IDS.staff,
      });

      await loginAsMember();
      const res = await agent.get(`/events/${event.id}/detail`);

      expect(res.status).toBe(403);
      expect(res.text).toMatch(/permission/i);
      // The rendered error page must not leak the event's private fields.
      expect(res.text).not.toContain(event.title);
    });
  });
});
