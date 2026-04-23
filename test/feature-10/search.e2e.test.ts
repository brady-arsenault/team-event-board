import request from "supertest";
import { buildTestApp } from "./helpers/buildTestApp";
import { DEMO_PASSWORD, USER_EMAILS, daysFromNow, makeEvent } from "./helpers/fixtures";
import type { IEvent, IEventRepository } from "../../src/contracts";

describe("GET /events/search — Feature 10 (e2e)", () => {
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
    expect(res.status).toBe(302);
  }

  beforeEach(() => {
    const harness = buildTestApp();
    eventRepository = harness.eventRepository;
    expressApp = harness.app.getExpressApp();
    agent = request.agent(expressApp);
  });

  describe("unauthenticated access", () => {
    it("redirects a plain GET to /login", async () => {
      const res = await request(expressApp).get("/events/search");

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("returns 401 for an HTMX request", async () => {
      const res = await request(expressApp)
        .get("/events/search")
        .set("HX-Request", "true");

      expect(res.status).toBe(401);
      expect(res.text).toMatch(/log in/i);
    });
  });

  describe("happy path", () => {
    it("renders the search page with all published upcoming events when q is empty", async () => {
      await seedEvent({ title: "Pottery Class" });
      await seedEvent({ title: "Board Game Night" });

      await loginAsMember();
      const res = await agent.get("/events/search");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Search Events");
      expect(res.text).toContain("Pottery Class");
      expect(res.text).toContain("Board Game Night");
      expect(res.text).toContain("2 events found");
    });

    it("renders matching events for a keyword query", async () => {
      await seedEvent({ title: "Spring Hackathon" });
      await seedEvent({ title: "Book Club" });

      await loginAsMember();
      const res = await agent.get("/events/search").query({ q: "hackathon" });

      expect(res.status).toBe(200);
      expect(res.text).toContain("Spring Hackathon");
      expect(res.text).not.toContain("Book Club");
    });

    it("shows a 'no events match' message for a query with no matches", async () => {
      await seedEvent({ title: "Pottery Class" });

      await loginAsMember();
      const res = await agent.get("/events/search").query({ q: "nonexistent" });

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/no events match/i);
      expect(res.text).toContain("nonexistent");
    });
  });

  describe("HTMX requests", () => {
    it("returns just the results partial (no page chrome) on HX-Request", async () => {
      await seedEvent({ title: "Open Mic" });

      await loginAsMember();
      const res = await agent
        .get("/events/search")
        .query({ q: "open" })
        .set("HX-Request", "true");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Open Mic");
      // Page chrome (search form, heading) must not be in the partial response.
      expect(res.text).not.toContain("Search Events");
      expect(res.text).not.toMatch(/<form[\s\S]*hx-get=/);
    });

    it("returns the empty-state partial when no results match", async () => {
      await loginAsMember();
      const res = await agent
        .get("/events/search")
        .query({ q: "foo" })
        .set("HX-Request", "true");

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/no events match/i);
    });
  });

  describe("InvalidInputError", () => {
    it("returns 400 when query exceeds 500 characters", async () => {
      await loginAsMember();
      const longQuery = "a".repeat(501);
      const res = await agent.get("/events/search").query({ q: longQuery });

      expect(res.status).toBe(400);
      expect(res.text).toMatch(/500 characters/);
    });

    it("returns 400 HTMX partial when query exceeds 500 characters on HX-Request", async () => {
      await loginAsMember();
      const longQuery = "a".repeat(501);
      const res = await agent
        .get("/events/search")
        .query({ q: longQuery })
        .set("HX-Request", "true");

      expect(res.status).toBe(400);
      expect(res.text).toMatch(/500 characters/);
      // Partial: no full-page chrome.
      expect(res.text).not.toContain("Search Events");
    });
  });

  describe("edge case — draft and past events are excluded from results", () => {
    it("does not include draft, cancelled, or past events in search results", async () => {
      await seedEvent({ title: "Published Future", status: "published", startAt: daysFromNow(3) });
      await seedEvent({ title: "Draft Event", status: "draft" });
      await seedEvent({ title: "Cancelled Event", status: "cancelled" });
      await seedEvent({ title: "Past Event", status: "published", startAt: daysFromNow(-1) });

      await loginAsMember();
      const res = await agent.get("/events/search");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Published Future");
      expect(res.text).not.toContain("Draft Event");
      expect(res.text).not.toContain("Cancelled Event");
      expect(res.text).not.toContain("Past Event");
    });
  });
});
