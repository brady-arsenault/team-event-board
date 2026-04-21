import request from "supertest";
import { createComposedApp } from "../../src/composition";
import type { IApp } from "../../src/contracts";

describe("Event Creation", () => {
  let app: IApp;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(() => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
  });

  it("should successfully create an event when authenticated", async () => {
    // Step 1: Log in to get an authenticated session
    const loginResponse = await agent
      .post("/login")
      .send({
        email: "user@app.test",
        password: "password123",
      });

    // Log the response if login fails
    if (loginResponse.status !== 302) {
      console.log("Login failed with status:", loginResponse.status);
      console.log("Response body:", loginResponse.text);
    }

    expect(loginResponse.status).toBe(302);
    expect(loginResponse.header.location).toBe("/");

    // Step 2: Create an event
    const eventData = {
      title: "Test Event",
      description: "This is a test event",
      location: "Test Location",
      category: "social",
      capacity: "50",
      startAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endAt: new Date(Date.now() + 90000000).toISOString(), // Day after tomorrow
    };

    const createResponse = await agent
      .post("/events/create")
      .send(eventData)
      .expect(302); // Expect redirect after successful creation

    // Step 3: Verify redirect to home page
    expect(createResponse.header.location).toBe("/home");
  });
});