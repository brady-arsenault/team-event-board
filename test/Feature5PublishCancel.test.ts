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
});