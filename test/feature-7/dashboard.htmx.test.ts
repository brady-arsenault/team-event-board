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
  IRsvpRepository,
} from "../../src/contracts";

describe("GET /my-rsvps — HTMX partial response (Feature 7)", () => {
  let agent: ReturnType<typeof request.agent>;
  let eventRepository: IEventRepository;
  let rsvpRepository: IRsvpRepository;
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
    rsvpRepository = harness.rsvpRepository;
    expressApp = harness.app.getExpressApp();
    agent = request.agent(expressApp);
  });

  it("returns just the dashboard content partial (no page heading) on HX-Request", async () => {
    const event = await seedEvent({
      title: "Dynamic Reload Test",
      startAt: daysFromNow(3),
    });
    await rsvpRepository.create(
      makeRsvp(event.id, { userId: USER_IDS.reader, status: "going" }),
    );

    await loginAsMember();
    const res = await agent.get("/my-rsvps").set("HX-Request", "true");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Dynamic Reload Test");
    expect(res.text).toContain("Upcoming");
    expect(res.text).toContain("Past &amp; Cancelled");
    // The full-page chrome (the "My RSVPs" header block) must not be in the partial.
    expect(res.text).not.toContain("Events you have responded to");
  });

  it("still returns the full page (with heading) for a non-HTMX GET", async () => {
    await loginAsMember();
    const res = await agent.get("/my-rsvps");

    expect(res.status).toBe(200);
    // Full-page heading present.
    expect(res.text).toContain("My RSVPs");
    expect(res.text).toContain("Events you have responded to");
  });

  it("partial response wires the cancel form to the dashboard content container", async () => {
    const event = await seedEvent({ title: "Wire Test", startAt: daysFromNow(2) });
    await rsvpRepository.create(
      makeRsvp(event.id, { userId: USER_IDS.reader, status: "going" }),
    );

    await loginAsMember();
    const res = await agent.get("/my-rsvps").set("HX-Request", "true");

    expect(res.status).toBe(200);
    // The cancel button form targets the dashboard content container so the
    // toggle route can swap in a refreshed dashboard fragment.
    expect(res.text).toContain('hx-target="#my-rsvps-content"');
    expect(res.text).toContain('hx-swap="innerHTML"');
  });
});
