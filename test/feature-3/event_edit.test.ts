import request from "supertest";
import { createComposedApp } from "../../src/composition";
import type { IApp } from "../../src/contracts";

describe("Event Editing", () => {
  let app: IApp;
  let agent: ReturnType<typeof request.agent>;


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

  it("should successfully edit an event when authenticated", async () => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());

    await authenticate();

    const eventData = {
      title: "Test Event",
      description: "This is a test event",
      location: "Test Location",
      category: "social",
      capacity: "50",
      startAt: new Date(Date.now() + 86400000).toISOString(), 
      endAt: new Date(Date.now() + 90000000).toISOString(), 
    };

    const createResponse = await agent
      .post("/events/create")
      .send(eventData)
      .expect(302);

    const updateData = {
      title: "Test Event 2",
      description: "This is test event 2",
      location: "Test Location 2",
      category: "educational",
      capacity: "100",
      startAt: new Date(Date.now() + 86400000 * 2).toISOString(), 
      endAt: new Date(Date.now() + 90000000 * 2).toISOString(), 
    }

    const editResponse = await agent
      .post("/events/edit/0")
      .send(updateData)
      .expect(302);

  });

  it("should error for an invalid capacity", async () => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());

    await authenticate();

    const eventData = {
      title: "Test Event",
      description: "This is a test event",
      location: "Test Location",
      category: "social",
      capacity: "50",
      startAt: new Date(Date.now() + 86400000).toISOString(), 
      endAt: new Date(Date.now() + 90000000).toISOString(), 
    };

    const createResponse = await agent
      .post("/events/create")
      .send(eventData)
      .expect(302);

    const updateData = {
      title: "Test Event 2",
      description: "This is test event 2",
      location: "Test Location 2",
      category: "educational",
      capacity: "-1",
      startAt: new Date(Date.now() + 90000000).toISOString(), 
      endAt: new Date(Date.now() + 86400000).toISOString(), 
    }

    const editResponse = await agent
      .post("/events/edit/0")
      .send(updateData)
      
    expect(editResponse.status).toBe(200); // Expect bad request for invalid capacity
    expect(editResponse.text).toContain("capacity must be a positive integer or null."); // Expect invalid capacity message
  });

  it("should error for an invalid date", async () => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());

    await authenticate();

    const eventData = {
      title: "Test Event",
      description: "This is a test event",
      location: "Test Location",
      category: "social",
      capacity: "50",
      startAt: new Date(Date.now() + 86400000).toISOString(), 
      endAt: new Date(Date.now() + 90000000).toISOString(), 
    };

    const createResponse = await agent
      .post("/events/create")
      .send(eventData)
      .expect(302);

    const updateData = {
      title: "Test Event 2",
      description: "This is test event 2",
      location: "Test Location 2",
      category: "educational",
      capacity: "100",
      startAt: new Date(Date.now() + 90000000).toISOString(), 
      endAt: new Date(Date.now() + 86400000).toISOString(), 
    }

    const editResponse = await agent
      .post("/events/edit/0")
      .send(updateData)
    
    expect(editResponse.status).toBe(200);
    expect(editResponse.text).toContain("startAt must be before endAt");
  });

  it("should error for an unauthenticated user", async () => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());

    await authenticate();
    
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
      .expect(302);

    await agent.post("/logout").expect(302);

    const updateData = {
      title: "Test Event 2",
      description: "This is test event 2",
      location: "Test Location 2",
      category: "educational",
      capacity: "100",
      startAt: new Date(Date.now() + 90000000).toISOString(), 
      endAt: new Date(Date.now() + 86400000).toISOString(), 
    }

    const editResponse = await agent
      .post("/events/edit/0")
      .send(updateData)
      
    expect(editResponse.status).toBe(401); // Expect bad request for unauthenticated user
    expect(editResponse.text).toContain("Please log in to continue"); // Expect log in message
  });


  it("should error for user who isn't organizer", async () => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());

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

    await agent.post("/logout").expect(302);

    const loginResponse = await agent
      .post("/login")
      .send({
        email: "staff@app.test",
        password: "password123",
      })
      .expect(302);

    const updateData = {
      title: "Test Event 2",
      description: "This is test event 2",
      location: "Test Location 2",
      category: "educational",
      capacity: null,
      startAt: new Date(Date.now() + 86400000 * 2).toISOString(), 
      endAt: new Date(Date.now() + 90000000 * 2).toISOString(), 
    }

    const editResponse = await agent
      .post("/events/edit/0")
      .send(updateData)
    
    expect(editResponse.status).toBe(403); // Expect unauthorized request for user who isn't organizer
    expect(editResponse.text).toContain("You are not allowed to edit this event."); // Expect unauthorized message

  });


  // Edge case
  it("should successfully edit an event even if capacity is null", async () => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());

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

    const updateData = {
      title: "Test Event 2",
      description: "This is test event 2",
      location: "Test Location 2",
      category: "educational",
      capacity: null,
      startAt: new Date(Date.now() + 86400000 * 2).toISOString(), 
      endAt: new Date(Date.now() + 90000000 * 2).toISOString(), 
    }

    const editResponse = await agent
      .post("/events/edit/0")
      .send(updateData)
      .expect(302); // Expect redirect after successful edit

  });

});