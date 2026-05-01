import request from "supertest";
import { createComposedApp } from "../src/composition";

function makeApp() {
  return createComposedApp().getExpressApp();
}

async function loginAsAdmin(app: ReturnType<typeof makeApp>) {
  const agent = request.agent(app);
  await agent.post("/login").type("form").send({ email: "admin@app.test", password: "password123" });
  return agent;
}

async function createDraftEvent(agent: ReturnType<typeof request.agent>) {
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  const title = "Feature 5 Publish Test Event";
  const response = await agent.post("/events/create").type("form").send({
    title,
    description: "Test description",
    location: "Campus Center",
    category: "social",
    capacity: "25",
    startAt: "2026-05-01T18:00",
    endAt: "2026-05-01T20:00",
  });

  expect([200, 302]).toContain(response.status);
  const redirectTarget = response.headers["hx-redirect"] ?? response.headers.location;
  expect(redirectTarget).toBe("/events/drafts");

  const createdCall = logSpy.mock.calls.find((call) => {
    return typeof call[0] === "string" && call[0].includes("Created event ");
  });

  expect(createdCall).toBeDefined();
  const message = String(createdCall?.[0]);
  const eventId = message.split("Created event ")[1];
  logSpy.mockRestore();
  return { eventId, title };
}

describe("Feature 5 publish and cancel", () => {
  it("returns 404 when trying to publish an event that does not exist", async () => {
    const app = makeApp();
    const agent = await loginAsAdmin(app);
    const response = await agent.post("/events/not-a-real-event-id/publish");
    expect(response.status).toBe(404);
    expect(response.text).toContain("Event not found.");
  });

  it("returns 404 when trying to cancel an event that does not exist", async () => {
    const app = makeApp();
    const agent = await loginAsAdmin(app);
    const response = await agent.post("/events/not-a-real-event-id/cancel");
    expect(response.status).toBe(404);
    expect(response.text).toContain("Event not found.");
  });

  it("publishes a draft event and then shows it on the home page", async () => {
    const app = makeApp();
    const agent = await loginAsAdmin(app);
    const { eventId, title } = await createDraftEvent(agent);
    const publishResponse = await agent.post(`/events/${eventId}/publish`);
    expect(publishResponse.status).toBe(302);
    expect(publishResponse.headers.location).toBe("/home");
    const homeResponse = await agent.get("/home");
    expect(homeResponse.status).toBe(200);
    expect(homeResponse.text).toContain(title);
  });
});

