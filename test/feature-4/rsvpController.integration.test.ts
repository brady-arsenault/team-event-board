import type { Response } from "express";
import { CreateRsvpController } from "../../src/rsvp/RsvpController";
import { CreateRsvpService } from "../../src/rsvp/RsvpService";
import { CreateInMemoryEventRepository } from "../../src/repository/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "../../src/repository/InMemoryRsvpRepository";
import {
  signInAuthenticatedUser,
  type AppSessionStore,
} from "../../src/session/AppSession";
import { silentLogger } from "./helpers/buildTestApp";
import { makeEvent, USER_IDS } from "./helpers/fixtures";

/**
 * Integration tests for `RsvpController.handleToggleRsvp` and
 * `RsvpController.showRsvpButton`. The controller is wired to a real service
 * and real in-memory repositories. The Express `Response` and the session
 * store are stubbed so we can assert on the rendered template, HTTP status,
 * and the locals handed to the view — without spinning up an HTTP server.
 */
describe("RsvpController — integration", () => {
  function makeMockResponse() {
    const res = {
      statusCode: 200,
      status: jest.fn().mockImplementation(function (
        this: typeof res,
        code: number,
      ) {
        this.statusCode = code;
        return this;
      }),
      render: jest.fn(),
      redirect: jest.fn(),
    };
    return res as unknown as Response & typeof res;
  }

  function makeSessionStore(): AppSessionStore {
    return {} as AppSessionStore;
  }

  function signInAs(
    store: AppSessionStore,
    opts: { userId: string; role: "admin" | "staff" | "user"; displayName: string; email: string },
  ): void {
    signInAuthenticatedUser(store, {
      id: opts.userId,
      email: opts.email,
      displayName: opts.displayName,
      role: opts.role,
    });
  }

  function build() {
    const eventRepo = CreateInMemoryEventRepository();
    const rsvpRepo = CreateInMemoryRsvpRepository();
    const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
    const controller = CreateRsvpController(service, silentLogger());
    return { eventRepo, rsvpRepo, service, controller };
  }

  describe("handleToggleRsvp — authentication", () => {
    it("responds 401 and renders partials/error when no user is signed in", async () => {
      const { controller } = build();
      const store = makeSessionStore();
      const res = makeMockResponse();

      await controller.handleToggleRsvp(res, "any-event", store);

      expect(res.status).toHaveBeenCalledWith(401);
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("partials/error");
      expect(locals.message).toMatch(/log in/i);
      expect(locals.layout).toBe(false);
    });
  });

  describe("handleToggleRsvp — happy path (member)", () => {
    it("creates a going RSVP and renders rsvp/button with the new rsvp", async () => {
      const { eventRepo, rsvpRepo, controller } = build();
      const event = await eventRepo.create(
        makeEvent({ status: "published", capacity: 10 }),
      );
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      const res = makeMockResponse();
      await controller.handleToggleRsvp(res, event.id, store);

      expect(res.status).not.toHaveBeenCalled();
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("rsvp/button");
      expect(locals.eventId).toBe(event.id);
      expect(locals.rsvp.status).toBe("going");
      expect(locals.layout).toBe(false);

      const persisted = await rsvpRepo.findByEventAndUser(
        event.id,
        USER_IDS.reader,
      );
      expect(persisted?.status).toBe("going");
    });

    it("toggles going -> cancelled when the same user clicks again", async () => {
      const { eventRepo, rsvpRepo, controller } = build();
      const event = await eventRepo.create(
        makeEvent({ status: "published", capacity: 10 }),
      );
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      // First click — creates a going RSVP.
      await controller.handleToggleRsvp(makeMockResponse(), event.id, store);

      // Second click — cancels.
      const res = makeMockResponse();
      await controller.handleToggleRsvp(res, event.id, store);

      const [, locals] = res.render.mock.calls[0];
      expect(locals.rsvp.status).toBe("cancelled");

      const persisted = await rsvpRepo.findByEventAndUser(
        event.id,
        USER_IDS.reader,
      );
      expect(persisted?.status).toBe("cancelled");
    });

    it("places a new RSVP on the waitlist when the event is full", async () => {
      const { eventRepo, rsvpRepo, controller } = build();
      const event = await eventRepo.create(
        makeEvent({ status: "published", capacity: 1 }),
      );

      // Seat user A.
      const storeA = makeSessionStore();
      signInAs(storeA, {
        userId: "user-a",
        role: "user",
        displayName: "Alice",
        email: "a@app.test",
      });
      await controller.handleToggleRsvp(makeMockResponse(), event.id, storeA);

      // User B arrives — event is already full.
      const storeB = makeSessionStore();
      signInAs(storeB, {
        userId: "user-b",
        role: "user",
        displayName: "Bob",
        email: "b@app.test",
      });
      const res = makeMockResponse();
      await controller.handleToggleRsvp(res, event.id, storeB);

      const [, locals] = res.render.mock.calls[0];
      expect(locals.rsvp.status).toBe("waitlisted");

      const persisted = await rsvpRepo.findByEventAndUser(event.id, "user-b");
      expect(persisted?.status).toBe("waitlisted");
    });
  });

  describe("handleToggleRsvp — error states", () => {
    it("responds 404 when the event does not exist", async () => {
      const { controller } = build();
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      const res = makeMockResponse();
      await controller.handleToggleRsvp(res, "does-not-exist", store);

      expect(res.status).toHaveBeenCalledWith(404);
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("partials/error");
      expect(locals.message).toMatch(/not found/i);
    });

    it("responds 400 (InvalidStateError) when the event is cancelled", async () => {
      const { eventRepo, controller } = build();
      const event = await eventRepo.create(
        makeEvent({ status: "cancelled" }),
      );
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      const res = makeMockResponse();
      await controller.handleToggleRsvp(res, event.id, store);

      expect(res.status).toHaveBeenCalledWith(400);
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("partials/error");
      expect(locals.message).toMatch(/cancelled|no longer/i);
    });

    it("responds 400 when the event startAt is in the past", async () => {
      const { eventRepo, controller } = build();
      const event = await eventRepo.create(
        makeEvent({
          status: "published",
          startAt: new Date("2000-01-01T00:00:00Z"),
          endAt: new Date("2000-01-01T02:00:00Z"),
        }),
      );
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      const res = makeMockResponse();
      await controller.handleToggleRsvp(res, event.id, store);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("showRsvpButton", () => {
    it("renders rsvp/button with null rsvp when the user has never RSVP'd", async () => {
      const { eventRepo, controller } = build();
      const event = await eventRepo.create(makeEvent({ status: "published" }));
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      const res = makeMockResponse();
      await controller.showRsvpButton(res, event.id, store);

      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("rsvp/button");
      expect(locals.eventId).toBe(event.id);
      expect(locals.rsvp).toBeNull();
      expect(locals.layout).toBe(false);
    });

    it("reflects an existing 'going' RSVP in the locals", async () => {
      const { eventRepo, rsvpRepo, controller } = build();
      const event = await eventRepo.create(makeEvent({ status: "published" }));
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });
      // Use the toggle to create a real 'going' RSVP, then query the button.
      await controller.handleToggleRsvp(makeMockResponse(), event.id, store);

      const res = makeMockResponse();
      await controller.showRsvpButton(res, event.id, store);

      const [, locals] = res.render.mock.calls[0];
      expect(locals.rsvp.status).toBe("going");
      expect(locals.rsvp.userId).toBe(USER_IDS.reader);

      // Sanity: the repo and locals agree.
      const persisted = await rsvpRepo.findByEventAndUser(
        event.id,
        USER_IDS.reader,
      );
      expect(persisted?.id).toBe(locals.rsvp.id);
    });

    it("responds 401 when no user is signed in", async () => {
      const { controller } = build();
      const store = makeSessionStore();

      const res = makeMockResponse();
      await controller.showRsvpButton(res, "any", store);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("responds 404 and renders partials/error when the event does not exist", async () => {
      const { controller } = build();
      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      const res = makeMockResponse();
      await controller.showRsvpButton(res, "missing", store);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("service delegation", () => {
    it("forwards the acting user from the session to toggleRsvp", async () => {
      const eventRepo = CreateInMemoryEventRepository();
      const rsvpRepo = CreateInMemoryRsvpRepository();
      const service = CreateRsvpService(eventRepo, rsvpRepo, silentLogger());
      const spy = jest.spyOn(service, "toggleRsvp");
      const controller = CreateRsvpController(service, silentLogger());
      const event = await eventRepo.create(
        makeEvent({ status: "published", capacity: 10 }),
      );

      const store = makeSessionStore();
      signInAs(store, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
        email: "user@app.test",
      });

      await controller.handleToggleRsvp(makeMockResponse(), event.id, store);

      expect(spy).toHaveBeenCalledWith(event.id, {
        userId: USER_IDS.reader,
        role: "user",
        displayName: "Una User",
      });
    });
  });
});
