import request from "supertest";
import { buildTestApp } from "../helpers/buildTestApp";
import { DEMO_PASSWORD, USER_EMAILS, makeEvent } from "./helpers/fixtures";
import type {
  IEvent,
  IEventRepository,
  IRsvpRepository,
} from "../../src/contracts";

/**
 * End-to-end tests for Feature 4 — RSVP Toggle.
 *
 * Drives the full Express stack with supertest: logs in through POST /login to
 * establish a real session cookie, then POSTs to /events/:id/rsvp to toggle
 * attendance, and GETs /events/:id/rsvp to render the button fragment.
 */
describe("POST/GET /events/:id/rsvp — e2e", () => {
  let eventRepository: IEventRepository;
  let rsvpRepository: IRsvpRepository;
  let expressApp: ReturnType<
    ReturnType<typeof buildTestApp>["app"]["getExpressApp"]
  >;

  async function seedEvent(overrides: Partial<IEvent> = {}): Promise<IEvent> {
    return eventRepository.create(makeEvent(overrides));
  }

  async function login(
    email: string,
    password = DEMO_PASSWORD,
  ): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(expressApp);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ email, password });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    return agent;
  }

  beforeEach(() => {
    const harness = buildTestApp();
    eventRepository = harness.eventRepository;
    rsvpRepository = harness.rsvpRepository;
    expressApp = harness.app.getExpressApp();
  });

  describe("authentication", () => {
    it("returns 401 when a POST is made without a session", async () => {
      const event = await seedEvent({ status: "published" });
      const res = await request(expressApp).post(`/events/${event.id}/rsvp`);

      expect(res.status).toBe(401);
      expect(res.text).toMatch(/log in/i);
    });

    it("returns 401 when an HTMX GET is made without a session", async () => {
      // The button fragment is always loaded via HTMX (hx-get + hx-trigger=load),
      // so the realistic unauthenticated case sets the HX-Request header.
      const event = await seedEvent({ status: "published" });
      const res = await request(expressApp)
        .get(`/events/${event.id}/rsvp`)
        .set("HX-Request", "true");

      expect(res.status).toBe(401);
      expect(res.text).toMatch(/log in/i);
    });

    it("redirects a plain GET to /login when no session is present", async () => {
      const event = await seedEvent({ status: "published" });
      const res = await request(expressApp).get(`/events/${event.id}/rsvp`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });
  });

  describe("happy path toggle flow (member)", () => {
    it("renders the RSVP button with null rsvp before any click", async () => {
      const event = await seedEvent({ status: "published" });
      const agent = await login(USER_EMAILS.reader);

      const res = await agent.get(`/events/${event.id}/rsvp`);
      expect(res.status).toBe(200);
      // Before clicking, the primary button label is "RSVP" (not "Cancel RSVP").
      expect(res.text).toContain("RSVP");
      expect(res.text).not.toContain("Cancel RSVP");
    });

    it("RSVP -> Cancel -> RSVP cycles the button and persists each status", async () => {
      const event = await seedEvent({ status: "published", capacity: 10 });
      const agent = await login(USER_EMAILS.reader);

      // First click — becomes "going".
      const click1 = await agent.post(`/events/${event.id}/rsvp`);
      expect(click1.status).toBe(200);
      expect(click1.text).toContain("Going");
      expect(click1.text).toContain("Cancel RSVP");

      let rsvps = await rsvpRepository.findByEvent(event.id);
      expect(rsvps).toHaveLength(1);
      expect(rsvps[0].status).toBe("going");

      // Second click — cancels.
      const click2 = await agent.post(`/events/${event.id}/rsvp`);
      expect(click2.status).toBe(200);
      expect(click2.text).not.toContain("Going");
      expect(click2.text).not.toContain("Waitlisted");
      // Back to the "RSVP" primary action.
      expect(click2.text).toContain(">\n          RSVP\n");

      rsvps = await rsvpRepository.findByEvent(event.id);
      expect(rsvps[0].status).toBe("cancelled");

      // Third click — re-activates as "going".
      const click3 = await agent.post(`/events/${event.id}/rsvp`);
      expect(click3.status).toBe(200);
      expect(click3.text).toContain("Going");

      rsvps = await rsvpRepository.findByEvent(event.id);
      expect(rsvps).toHaveLength(1); // still one row — update, not create.
      expect(rsvps[0].status).toBe("going");
    });

    it("returns only the button fragment (no base layout) so HTMX can swap it in", async () => {
      const event = await seedEvent({ status: "published" });
      const agent = await login(USER_EMAILS.reader);

      const res = await agent.post(`/events/${event.id}/rsvp`);
      expect(res.status).toBe(200);
      // The base layout would include <html> / <body>; the fragment must not.
      expect(res.text).not.toMatch(/<html/i);
      expect(res.text).not.toMatch(/<body/i);
      // It must be the rsvp-widget fragment.
      expect(res.text).toContain('id="rsvp-widget"');
    });
  });

  describe("capacity enforcement places late members on the waitlist", () => {
    it("second member hits the waitlist when capacity is 1", async () => {
      const event = await seedEvent({ status: "published", capacity: 1 });

      // Member A — admin demo user, acting as a member here via the toggle.
      const memberA = await login(USER_EMAILS.admin);
      const aResponse = await memberA.post(`/events/${event.id}/rsvp`);
      expect(aResponse.status).toBe(200);
      expect(aResponse.text).toContain("Going");

      // Member B — second click, no more seats.
      const memberB = await login(USER_EMAILS.reader);
      const bResponse = await memberB.post(`/events/${event.id}/rsvp`);
      expect(bResponse.status).toBe(200);
      expect(bResponse.text).toContain("Waitlisted");

      const rsvps = await rsvpRepository.findByEvent(event.id);
      expect(rsvps).toHaveLength(2);
      const bRsvp = rsvps.find((r) => r.userId === "user-reader");
      expect(bRsvp?.status).toBe("waitlisted");
    });

    it("does not count cancelled RSVPs against capacity", async () => {
      const event = await seedEvent({ status: "published", capacity: 1 });

      // Member A joins then cancels — frees up the seat.
      const memberA = await login(USER_EMAILS.admin);
      await memberA.post(`/events/${event.id}/rsvp`); // going
      await memberA.post(`/events/${event.id}/rsvp`); // cancelled

      // Member B should now get a real seat, not the waitlist.
      const memberB = await login(USER_EMAILS.reader);
      const bResponse = await memberB.post(`/events/${event.id}/rsvp`);
      expect(bResponse.text).toContain("Going");
    });

    it("treats capacity=null as unlimited so nobody is ever waitlisted", async () => {
      const event = await seedEvent({ status: "published", capacity: null });

      const memberA = await login(USER_EMAILS.admin);
      const memberB = await login(USER_EMAILS.reader);
      const memberC = await login(USER_EMAILS.staff);

      for (const agent of [memberA, memberB, memberC]) {
        const res = await agent.post(`/events/${event.id}/rsvp`);
        expect(res.text).toContain("Going");
        expect(res.text).not.toContain("Waitlisted");
      }
    });
  });

  describe("rejected event states", () => {
    it("returns 422 when toggling on a cancelled event", async () => {
      const event = await seedEvent({ status: "cancelled" });
      const agent = await login(USER_EMAILS.reader);

      const res = await agent.post(`/events/${event.id}/rsvp`);
      expect(res.status).toBe(422);
      expect(res.text).toMatch(/cancelled|no longer/i);
    });

    it("returns 422 when toggling on a past event (status)", async () => {
      const event = await seedEvent({ status: "past" });
      const agent = await login(USER_EMAILS.reader);

      const res = await agent.post(`/events/${event.id}/rsvp`);
      expect(res.status).toBe(422);
    });

    it("returns 422 when toggling on an event whose startAt is in the past", async () => {
      const event = await seedEvent({
        status: "published",
        startAt: new Date("2000-01-01T00:00:00Z"),
        endAt: new Date("2000-01-01T02:00:00Z"),
      });
      const agent = await login(USER_EMAILS.reader);

      const res = await agent.post(`/events/${event.id}/rsvp`);
      expect(res.status).toBe(422);
    });

    it("does not persist an RSVP when the event is rejected", async () => {
      const event = await seedEvent({ status: "cancelled" });
      const agent = await login(USER_EMAILS.reader);

      await agent.post(`/events/${event.id}/rsvp`);
      const rsvps = await rsvpRepository.findByEvent(event.id);
      expect(rsvps).toHaveLength(0);
    });

    it("returns 404 when toggling on a non-existent event", async () => {
      const agent = await login(USER_EMAILS.reader);
      const res = await agent.post(`/events/does-not-exist/rsvp`);

      expect(res.status).toBe(404);
      expect(res.text).toMatch(/not found/i);
    });
  });

  describe("attendee count updates inline", () => {
    it("going count grows by 1 after a click and shrinks by 1 after cancel", async () => {
      const event = await seedEvent({ status: "published", capacity: 10 });
      const agent = await login(USER_EMAILS.reader);

      expect(await rsvpRepository.countGoingByEvent(event.id)).toBe(0);

      await agent.post(`/events/${event.id}/rsvp`);
      expect(await rsvpRepository.countGoingByEvent(event.id)).toBe(1);

      await agent.post(`/events/${event.id}/rsvp`);
      expect(await rsvpRepository.countGoingByEvent(event.id)).toBe(0);
    });
  });
});
