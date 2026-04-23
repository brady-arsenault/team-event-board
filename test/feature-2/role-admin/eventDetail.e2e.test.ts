import request from "supertest";
import { buildTestApp } from "../../helpers/buildTestApp";
import {
  DEMO_PASSWORD,
  USER_EMAILS,
  USER_IDS,
  makeEvent,
} from "./helpers/fixtures";
import type { IEvent, IEventRepository } from "../../../src/contracts";

/**
 * End-to-end tests for Feature 2 from the perspective of the "admin" role.
 * We drive the full Express stack with supertest: log in through POST /login
 * to establish a real session cookie, then issue GET /events/:id/detail and
 * inspect the rendered HTML.
 *
 * Admins have a draft bypass: they can view any draft regardless of organizer.
 * They also see the Cancel control on any published event, per the template.
 */
describe("GET /events/:id/detail — admin role (e2e)", () => {
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
      // Title, description, location, category, capacity, organizer, status.
      expect(res.text).toContain("Spring Game Night");
      expect(res.text).toContain("Board games and snacks.");
      expect(res.text).toContain("Student Center 204");
      expect(res.text).toContain("social");
      expect(res.text).toContain("30 spots");
      expect(res.text).toContain(USER_IDS.staff);
      expect(res.text).toContain("published");
      // Admin sees Cancel on any published event.
      expect(res.text).toContain(`/events/${event.id}/cancel`);
      // Edit and Publish are organizer-only per the template.
      expect(res.text).not.toContain(`/events/edit/${event.id}`);
      expect(res.text).not.toContain(`/events/${event.id}/publish`);
      // The RSVP widget is still loaded via HTMX.
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
      // Draft, not published — no Cancel control.
      expect(res.text).not.toContain(`/events/${event.id}/cancel`);
      // Not the organizer — no Publish or Edit controls.
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
      // Draft is not published — no Cancel control.
      expect(res.text).not.toContain(`/events/${event.id}/cancel`);
    });
  });
});
