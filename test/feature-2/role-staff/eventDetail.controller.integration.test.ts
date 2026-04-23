import type { Response } from "express";
import { CreateEventController } from "../../../src/controller";
import { CreateEventService } from "../../../src/service";
import { CreateInMemoryEventRepository } from "../../../src/repository/InMemoryEventRepository";
import {
  signInAuthenticatedUser,
  type AppSessionStore,
} from "../../../src/session/AppSession";
import { silentLogger } from "../../helpers/buildTestApp";
import { makeEvent, USER_IDS } from "./helpers/fixtures";

/**
 * Integration tests for `eventDetailFromForm` focused on the "staff" role.
 * The controller is wired to a real EventService and a real in-memory
 * repository, but the Express Response and session are stubbed so we can
 * assert on the rendered template and the HTTP status code without spinning
 * up an HTTP server.
 */
describe("EventController.eventDetailFromForm — staff role (integration)", () => {
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

  function signInAsStaff(store: AppSessionStore): void {
    signInAuthenticatedUser(store, {
      id: USER_IDS.staff,
      email: "staff@app.test",
      displayName: "Sam Staff",
      role: "staff",
    });
  }

  function build() {
    const repo = CreateInMemoryEventRepository();
    const service = CreateEventService(repo, silentLogger());
    const controller = CreateEventController(service, silentLogger());
    return { repo, service, controller };
  }

  it("renders events/detail for a staff viewer on a published event they did not organize", async () => {
    const { repo, controller } = build();
    const event = await repo.create(
      makeEvent({ status: "published", organizerId: "some-other-user" }),
    );
    const store = makeSessionStore();
    signInAsStaff(store);

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

  it("renders events/detail for a staff viewer on a published event they organized", async () => {
    const { repo, controller } = build();
    const event = await repo.create(
      makeEvent({ status: "published", organizerId: USER_IDS.staff }),
    );
    const store = makeSessionStore();
    signInAsStaff(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, event.id, store, false);

    expect(res.status).not.toHaveBeenCalled();
    const [template, locals] = res.render.mock.calls[0];
    expect(template).toBe("events/detail");
    expect(locals.event.organizerId).toBe(USER_IDS.staff);
  });

  it("renders events/detail without layout when the request is HTMX", async () => {
    const { repo, controller } = build();
    const event = await repo.create(makeEvent({ status: "published" }));
    const store = makeSessionStore();
    signInAsStaff(store);

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

  it("responds 404 and renders partials/error when the event does not exist", async () => {
    const { controller } = build();
    const store = makeSessionStore();
    signInAsStaff(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, "nope", store, false);

    expect(res.status).toHaveBeenCalledWith(404);
    const [template, locals] = res.render.mock.calls[0];
    expect(template).toBe("partials/error");
    expect(locals.message).toMatch(/not found/i);
  });

  describe("draft visibility", () => {
    it("renders the draft for a staff viewer who is the organizer", async () => {
      const { repo, controller } = build();
      const event = await repo.create(
        makeEvent({ status: "draft", organizerId: USER_IDS.staff }),
      );
      const store = makeSessionStore();
      signInAsStaff(store);

      const res = makeMockResponse();
      await controller.eventDetailFromForm(res, event.id, store, false);

      expect(res.status).not.toHaveBeenCalled();
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("events/detail");
      expect(locals.event.id).toBe(event.id);
      expect(locals.event.status).toBe("draft");
    });

    it("responds 403 when a staff viewer who is not the organizer requests a draft", async () => {
      const { repo, controller } = build();
      const event = await repo.create(
        makeEvent({ status: "draft", organizerId: "some-other-user" }),
      );
      const store = makeSessionStore();
      signInAsStaff(store);

      const res = makeMockResponse();
      await controller.eventDetailFromForm(res, event.id, store, false);

      expect(res.status).toHaveBeenCalledWith(403);
      const [template, locals] = res.render.mock.calls[0];
      expect(template).toBe("partials/error");
      expect(locals.message).toMatch(/permission/i);
    });
  });

  it("delegates to the service and passes through the acting staff user", async () => {
    // Verifies the controller extracts the acting user from the session and
    // forwards it to the service — protects the contract between layers.
    const repo = CreateInMemoryEventRepository();
    const service = CreateEventService(repo, silentLogger());
    const spy = jest.spyOn(service, "getEventById");
    const controller = CreateEventController(service, silentLogger());
    const event = await repo.create(makeEvent({ status: "published" }));

    const store = makeSessionStore();
    signInAsStaff(store);

    const res = makeMockResponse();
    await controller.eventDetailFromForm(res, event.id, store, false);

    expect(spy).toHaveBeenCalledWith(event.id, {
      userId: USER_IDS.staff,
      role: "staff",
      displayName: "Sam Staff",
    });
  });
});
