import request from "supertest";
import { CreateEventService } from "../src/service";
import { CreateInMemoryEventRepository } from "../src/repository/InMemoryEventRepository";
import { silentLogger } from "./helpers/buildTestApp";
import { createComposedApp } from "../src/composition";
import type { IActingUser, IEvent, IEventRepository } from "../src/contracts";

const STAFF_ACTING: IActingUser = {
  userId: "user-staff",
  role: "staff",
  displayName: "Sam Staff",
};
const ADMIN_ACTING: IActingUser = {
  userId: "user-admin",
  role: "admin",
  displayName: "Avery Admin",
};
const READER_ACTING: IActingUser = {
  userId: "user-reader",
  role: "user",
  displayName: "Una User",
};

function inFuture(daysAhead: number): Date {
  return new Date(Date.now() + daysAhead * 86_400_000);
}

async function seedDraft(
  repo: IEventRepository,
  overrides: Partial<IEvent>,
): Promise<IEvent> {
  return repo.create({
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2, 10)}`,
    title: overrides.title ?? "Untitled draft",
    description: overrides.description ?? "Draft description",
    location: overrides.location ?? "Somewhere",
    category: overrides.category ?? "social",
    capacity: overrides.capacity ?? null,
    status: overrides.status ?? "draft",
    startAt: overrides.startAt ?? inFuture(7),
    endAt: overrides.endAt ?? inFuture(7.1),
    organizerId: overrides.organizerId ?? STAFF_ACTING.userId,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  });
}

describe("EventService.listDrafts", () => {
  let repo: IEventRepository;
  let service: ReturnType<typeof CreateEventService>;

  beforeEach(() => {
    repo = CreateInMemoryEventRepository();
    service = CreateEventService(repo, silentLogger());
  });

  it("returns only the acting user's drafts for non-admin callers", async () => {
    await seedDraft(repo, { id: "mine", organizerId: STAFF_ACTING.userId });
    await seedDraft(repo, { id: "theirs", organizerId: ADMIN_ACTING.userId });

    const result = await service.listDrafts(STAFF_ACTING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((e) => e.id)).toEqual(["mine"]);
  });

  it("returns every draft for admin callers", async () => {
    await seedDraft(repo, { id: "a", organizerId: STAFF_ACTING.userId });
    await seedDraft(repo, { id: "b", organizerId: READER_ACTING.userId });

    const result = await service.listDrafts(ADMIN_ACTING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("excludes published, cancelled, and past events", async () => {
    await seedDraft(repo, { id: "draft", organizerId: STAFF_ACTING.userId });
    await seedDraft(repo, {
      id: "published",
      organizerId: STAFF_ACTING.userId,
      status: "published",
    });
    await seedDraft(repo, {
      id: "cancelled",
      organizerId: STAFF_ACTING.userId,
      status: "cancelled",
    });

    const result = await service.listDrafts(STAFF_ACTING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((e) => e.id)).toEqual(["draft"]);
  });

  it("sorts drafts by updatedAt descending (newest first)", async () => {
    await seedDraft(repo, {
      id: "older",
      organizerId: STAFF_ACTING.userId,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await seedDraft(repo, {
      id: "newer",
      organizerId: STAFF_ACTING.userId,
      updatedAt: new Date("2026-04-01T00:00:00Z"),
    });

    const result = await service.listDrafts(STAFF_ACTING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("returns an empty array when the user has no drafts", async () => {
    const result = await service.listDrafts(READER_ACTING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});

describe("Drafts UI flow", () => {
  let app: ReturnType<typeof createComposedApp>;
  let agent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const res = await agent
      .post("/login")
      .type("form")
      .send({ email, password: "password123" });
    expect(res.status).toBe(302);
  }

  async function createEvent(input: {
    title: string;
    action?: "draft" | "publish";
  }) {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const res = await agent
      .post("/events/create")
      .type("form")
      .send({
        title: input.title,
        description: "Draft description",
        location: "Test loc",
        category: "social",
        capacity: "10",
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 90_000_000).toISOString(),
        ...(input.action ? { action: input.action } : {}),
      });
    const created = logSpy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("Created event "),
    );
    logSpy.mockRestore();
    const eventId = created
      ? String(created[0]).split("Created event ")[1].trim()
      : null;
    return { res, eventId };
  }

  beforeEach(() => {
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
  });

  describe("GET /events/drafts", () => {
    it("redirects unauthenticated visitors to login", async () => {
      const res = await request(app.getExpressApp()).get("/events/drafts");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    });

    it("renders the drafts page including the user's own drafts", async () => {
      await login("user@app.test");
      await createEvent({ title: "My private draft" });

      const res = await agent.get("/events/drafts");
      expect(res.status).toBe(200);
      expect(res.text).toContain("My Drafts");
      expect(res.text).toContain("My private draft");
    });

    it("does not show another user's draft to a non-admin viewer", async () => {
      await login("staff@app.test");
      await createEvent({ title: "Staff draft" });
      await agent.post("/logout");

      await login("user@app.test");
      const res = await agent.get("/events/drafts");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("Staff draft");
    });

    it("shows every user's drafts to admin viewers", async () => {
      await login("staff@app.test");
      await createEvent({ title: "Staff draft" });
      await agent.post("/logout");

      await login("admin@app.test");
      const res = await agent.get("/events/drafts");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Staff draft");
    });
  });

  describe("POST /events/create publish-on-create", () => {
    it("redirects to /events/drafts when no action is provided (default = draft)", async () => {
      await login("user@app.test");
      const { res } = await createEvent({ title: "Unset action" });
      expect(res.status).toBe(302);
      expect(res.headers["hx-redirect"] ?? res.headers.location).toBe(
        "/events/drafts",
      );
    });

    it("redirects to /events/drafts when action=draft is submitted", async () => {
      await login("user@app.test");
      const { res } = await createEvent({
        title: "Save as draft",
        action: "draft",
      });
      expect(res.status).toBe(302);
      expect(res.headers["hx-redirect"] ?? res.headers.location).toBe(
        "/events/drafts",
      );
    });

    it("redirects to /home and publishes the event when action=publish is submitted", async () => {
      await login("user@app.test");
      const { res, eventId } = await createEvent({
        title: "Publish immediately",
        action: "publish",
      });
      expect(res.status).toBe(302);
      expect(res.headers["hx-redirect"] ?? res.headers.location).toBe("/home");
      expect(eventId).not.toBeNull();

      // The event should now be visible on the home page (which only lists
      // published, upcoming events).
      const home = await agent.get("/home");
      expect(home.status).toBe(200);
      expect(home.text).toContain("Publish immediately");
    });

    it("does not list a published-on-create event under My Drafts", async () => {
      await login("user@app.test");
      await createEvent({
        title: "Skip the drafts list",
        action: "publish",
      });

      const drafts = await agent.get("/events/drafts");
      expect(drafts.status).toBe(200);
      expect(drafts.text).not.toContain("Skip the drafts list");
    });
  });
});
