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

  async function authenticate() {
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
  }

  it("should successfully create an event when authenticated", async () => {
    // Step 1: Log in to get an authenticated session
      await authenticate();

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

  it("should error for an invalid capacity", async () => {
    // Step 1: Log in to get an authenticated session
      await authenticate();

    // Step 2: Create an event
    const eventData = {
      title: "Test Event",
      description: "This is a test event",
      location: "Test Location",
      category: "social",
      capacity: "-1",
      startAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endAt: new Date(Date.now() + 90000000).toISOString(), // Day after tomorrow
    };

    const createResponse = await agent
      .post("/events/create")
      .send(eventData)
      
    expect(createResponse.status).toBe(400); // Expect bad request for invalid capacity
    expect(createResponse.text).toContain("capacity must be a positive integer or null."); // Expect invalid capacity message
  });

  it("should error for an invalid date", async () => {
    // Step 1: Log in to get an authenticated session
      await authenticate();

    // Step 2: Create an event
    const eventData = {
      title: "Test Event",
      description: "This is a test event",
      location: "Test Location",
      category: "social",
      capacity: "50",
      startAt: new Date(Date.now() + 90000000).toISOString(), // Day after tomorrow
      endAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    };

    const createResponse = await agent
      .post("/events/create")
      .send(eventData)
      
    expect(createResponse.status).toBe(400); // Expect bad request for invalid date
    expect(createResponse.text).toContain("startAt must be before endAt"); // Expect invalid date message
  });

  it("should error for an unauthenticated user", async () => {
   // Step 1: Create an event
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
      
    expect(createResponse.status).toBe(401); // Expect bad request for unauthenticated user
    expect(createResponse.text).toContain("Please log in to continue"); // Expect log in message
  });


  // Edge case
  it("should successfully create an event even if capacity is null", async () => {
    // Step 1: Log in to get an authenticated session
      await authenticate();

    // Step 2: Create an event
    const eventData = {
      title: "Test Event",
      description: "This is a test event",
      location: "Test Location",
      category: "social",
      capacity: null,
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