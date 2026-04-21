import type { Response } from "express";
import { CreateEventController } from "../../../src/controller";
import { CreateEventService } from "../../../src/service";
import { CreateInMemoryEventRepository } from "../../../src/repository/InMemoryEventRepository";
import {
  signInAuthenticatedUser,
  type AppSessionStore,
} from "../../../src/session/AppSession";
import { silentLogger } from "./helpers/buildTestApp";
import { makeEvent, USER_IDS } from "./helpers/fixtures";

/**
 * Integration tests for `eventDetailFromForm` focused on the "admin" role.
 * The controller is wired to a real EventService and a real in-memory
 * repository, but the Express Response and session are stubbed so we can
 * assert on the rendered template and the HTTP status code without spinning
 * up an HTTP server.
 *
 * The key admin-specific behaviour exercised here is the draft bypass:
 * admins can view any draft, even ones they did not organize.
 */
describe("EventController.eventDetailFromForm — admin role (integration)", () => {
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

  function signInAsAdmin(store: AppSessionStore): void {
    signInAuthenticatedUser(store, {
      id: USER_IDS.admin,
      email: "admin@app.test",
      displayName: "Avery Admin",
      role: "admin",
    });
  }

  function build() {
    const repo = CreateInMemoryEventRepository();
    const service = CreateEventService(repo, silentLogger());
    const controller = CreateEventController(service, silentLogger());
    return { repo, service, controller };
  }

  it("renders events/detail for an admin viewer on a published event they did not organize", async () => {
    const { repo, controller } = build();
    const event = await repo.create(
      makeEvent({ status: "published", organizerId: USER_IDS.staff }),
    );
    const store = makeSessionStore();
    signInAsAdmin(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, event.id, store, false);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledTimes(1);
    const [template, locals] = res.render.mock.calls[0];
    expect(template).toBe("events/detail");
    expect(locals.event).toEqual(event);
    expect(locals.pageError).toBeNull();
    expect(locals.session).toBeDefined();
    expect(locals.layout).toBeUndefined();
  });

  it("renders events/detail for an admin viewer on a published event they organized", async () => {
    const { repo, controller } = build();
    const event = await repo.create(
      makeEvent({ status: "published", organizerId: USER_IDS.admin }),
    );
    const store = makeSessionStore();
    signInAsAdmin(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, event.id, store, false);

    expect(res.status).not.toHaveBeenCalled();
    const [template, locals] = res.render.mock.calls[0];
    expect(template).toBe("events/detail");
    expect(locals.event.organizerId).toBe(USER_IDS.admin);
  });

  it("renders events/detail without layout when the request is HTMX", async () => {
    const { repo, controller } = build();
    const event = await repo.create(makeEvent({ status: "published" }));
    const store = makeSessionStore();
    signInAsAdmin(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, event.id, store, true);

    const [, locals] = res.render.mock.calls[0];
    expect(locals.layout).toBe(false);
  });

  it("responds 401 and renders partials/error when no user is signed in", async () => {
    const { controller } = build();
    const store = makeSessionStore();

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, "any-id", store, false);

    expect(res.status).toHaveBeenCalledWith(401);
    const [template, locals] = res.render.mock.calls[0];
    expect(template).toBe("partials/error");
    expect(locals.message).toMatch(/log in/i);
    expect(locals.layout).toBe(false);
  });

  it("responds 404 and renders partials/error when the event does not exist, even for an admin", async () => {
    const { controller } = build();
    const store = makeSessionStore();
    signInAsAdmin(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, "nope", store, false);

    expect(res.status).toHaveBeenCalledWith(404);
    const [template, locals] = res.render.mock.calls[0];
    expect(template).toBe("partials/error");
    expect(locals.message).toMatch(/not found/i);
  });

  describe("draft visibility — admin bypass", () => {
    it("renders the draft for an admin even when they are not the organizer", async () => {
      const { repo, controller } = build();
      const event = await repo.create(
        makeEvent({ status: "draft", organizerId: USER_IDS.staff }),
      );
      const store = makeSessionStore();
      signInAsAdmin(store);

      const res = makeMockResponse();
      await controller.eventDetailFromForm(res, event.id, store, false);

      expect(res.status).not.toHaveBeenCalled();
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("events/detail");
      expect(locals.event.id).toBe(event.id);
      expect(locals.event.status).toBe("draft");
    });

    it("renders the draft for an admin who is also the organizer", async () => {
      const { repo, controller } = build();
      const event = await repo.create(
        makeEvent({ status: "draft", organizerId: USER_IDS.admin }),
      );
      const store = makeSessionStore();
      signInAsAdmin(store);

      const res = makeMockResponse();
      await controller.eventDetailFromForm(res, event.id, store, false);

      expect(res.status).not.toHaveBeenCalled();
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("events/detail");
      expect(locals.event.status).toBe("draft");
    });
  });

  it("delegates to the service and passes through the acting admin user", async () => {
    // Verifies the controller extracts the acting user from the session and
    // forwards it to the service — protects the contract between layers.
    const repo = CreateInMemoryEventRepository();
    const service = CreateEventService(repo, silentLogger());
    const spy = jest.spyOn(service, "getEventById");
    const controller = CreateEventController(service, silentLogger());
    const event = await repo.create(makeEvent({ status: "published" }));

    const store = makeSessionStore();
    signInAsAdmin(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, event.id, store, false);

    expect(spy).toHaveBeenCalledWith(event.id, {
      userId: USER_IDS.admin,
      role: "admin",
      displayName: "Avery Admin",
    });
  });
});
