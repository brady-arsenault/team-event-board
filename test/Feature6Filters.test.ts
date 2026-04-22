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

describe("Feature 6 filters", () => {
  it("shows /home for a logged-in user with no filters", async () => {
    const app = makeApp();
    const agent = await loginAsAdmin(app);
    const response = await agent.get("/home");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Filter Events");
    expect(response.text).toContain("Upcoming Events");
  });

  it("returns 400 for an invalid category filter", async () => {
    const app = makeApp();
    const agent = await loginAsAdmin(app);
    const response = await agent.get("/home?category=not-a-real-category");
    expect(response.status).toBe(400);
    expect(response.text).toContain("Invalid category filter.");
  });

  it("returns 400 for an invalid timeframe filter", async () => {
    const app = makeApp();
    const agent = await loginAsAdmin(app);
    const response = await agent.get("/home?timeframe=not-a-real-timeframe");
    expect(response.status).toBe(400);
    expect(response.text).toContain("Invalid timeframe filter.");
  });
});

