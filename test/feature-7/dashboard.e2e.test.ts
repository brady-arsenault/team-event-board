import request from "supertest";
import { buildTestApp } from "./helpers/buildTestApp";
import {
  DEMO_PASSWORD,
  USER_EMAILS,
  USER_IDS,
  daysFromNow,
  makeEvent,
  makeRsvp,
} from "./helpers/fixtures";
import type {
  IEvent,
  IEventRepository,
  IRsvp,
  IRsvpRepository,
  RsvpStatus,
} from "../../src/contracts";

describe("GET /my-rsvps — Feature 7 (e2e)", () => {
  let agent: ReturnType<typeof request.agent>;
  let eventRepository: IEventRepository;
  let rsvpRepository: IRsvpRepository;
  let expressApp: ReturnType<
    ReturnType<typeof buildTestApp>["app"]["getExpressApp"]
  >;

  async function seedEvent(overrides: Partial<IEvent> = {}): Promise<IEvent> {
    return eventRepository.create(makeEvent(overrides));
  }

  async function seedRsvp(
    eventId: string,
    userId: string,
    status: RsvpStatus = "going",
  ): Promise<IRsvp> {
    return rsvpRepository.create(makeRsvp(eventId, { userId, status }));
  }

  async function login(email: string): Promise<void> {
    const res = await agent
      .post("/login")
      .type("form")
      .send({ email, password: DEMO_PASSWORD });
    expect(res.status).toBe(302);
  }

  beforeEach(() => {
    const harness = buildTestApp();
    eventRepository = harness.eventRepository;
    rsvpRepository = harness.rsvpRepository;
    expressApp = harness.app.getExpressApp();
    agent = request.agent(expressApp);
  });

  describe("unauthenticated access", () => {
    it("redirects a plain GET to /login", async () => {
      const res = await request(expressApp).get("/my-rsvps");

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("returns 401 for an HTMX request", async () => {
      const res = await request(expressApp)
        .get("/my-rsvps")
        .set("HX-Request", "true");

      expect(res.status).toBe(401);
      expect(res.text).toMatch(/log in/i);
    });
  });

  describe("role authorization", () => {
    it("returns 403 when an admin user accesses the dashboard", async () => {
      await login(USER_EMAILS.admin);
      const res = await agent.get("/my-rsvps");

      expect(res.status).toBe(403);
      expect(res.text).toMatch(/members/i);
    });

    it("returns 403 when a staff user accesses the dashboard", async () => {
      await login(USER_EMAILS.staff);
      const res = await agent.get("/my-rsvps");

      expect(res.status).toBe(403);
      expect(res.text).toMatch(/members/i);
    });
  });

  describe("happy path — member role", () => {
    it("renders the dashboard heading and empty-state copy when the member has no RSVPs", async () => {
      await login(USER_EMAILS.reader);
      const res = await agent.get("/my-rsvps");

      expect(res.status).toBe(200);
      expect(res.text).toContain("My RSVPs");
      expect(res.text).toContain("Upcoming");
      expect(res.text).toMatch(/no upcoming RSVPs/i);
      expect(res.text).toMatch(/no past or cancelled/i);
    });

    it("renders a going RSVP on a future published event in the Upcoming section", async () => {
      const event = await seedEvent({
        title: "Community Potluck",
        startAt: daysFromNow(4),
      });
      await seedRsvp(event.id, USER_IDS.reader, "going");

      await login(USER_EMAILS.reader);
      const res = await agent.get("/my-rsvps");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Community Potluck");
      expect(res.text).toContain("going");
      // The empty-state copy for upcoming should be absent when there is content.
      expect(res.text).not.toMatch(/no upcoming RSVPs/i);
    });

    it("renders a cancelled RSVP in the Past & Cancelled section", async () => {
      const event = await seedEvent({
        title: "Was Going",
        startAt: daysFromNow(4),
      });
      await seedRsvp(event.id, USER_IDS.reader, "cancelled");

      await login(USER_EMAILS.reader);
      const res = await agent.get("/my-rsvps");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Was Going");
      expect(res.text).toContain("Past &amp; Cancelled");
      expect(res.text).not.toMatch(/no past or cancelled/i);
    });

    it("isolates dashboards between members", async () => {
      // Two members each with their own RSVP on separate events.
      const myEvent = await seedEvent({ title: "My Event" });
      const otherEvent = await seedEvent({ title: "Someone Else's Event" });
      await seedRsvp(myEvent.id, USER_IDS.reader, "going");
      // Seed an RSVP belonging to the staff user (even though staff cannot view
      // the dashboard, their row should not leak into the reader's dashboard).
      await seedRsvp(otherEvent.id, USER_IDS.staff, "going");

      await login(USER_EMAILS.reader);
      const res = await agent.get("/my-rsvps");

      expect(res.status).toBe(200);
      expect(res.text).toContain("My Event");
      expect(res.text).not.toContain("Someone Else's Event");
    });
  });

  describe("edge case — mixed upcoming and past", () => {
    it("shows upcoming and past events grouped into their respective sections", async () => {
      const upcomingEvent = await seedEvent({
        title: "Upcoming Workshop",
        startAt: daysFromNow(6),
      });
      const pastEvent = await seedEvent({
        title: "Last Month Recital",
        status: "past",
        startAt: daysFromNow(-25),
      });
      await seedRsvp(upcomingEvent.id, USER_IDS.reader, "going");
      await seedRsvp(pastEvent.id, USER_IDS.reader, "going");

      await login(USER_EMAILS.reader);
      const res = await agent.get("/my-rsvps");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Upcoming Workshop");
      expect(res.text).toContain("Last Month Recital");
      // Both sections should have content — neither empty-state message appears.
      expect(res.text).not.toMatch(/no upcoming RSVPs/i);
      expect(res.text).not.toMatch(/no past or cancelled/i);
    });
  });
});
