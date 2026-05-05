import type { FindEventsQuery, IEvent, IEventRepository } from "../contracts";

class InMemoryEventRepository implements IEventRepository {
  private readonly events: IEvent[] = [];

  async findById(id: string): Promise<IEvent | null> {
    return this.events.find((e) => e.id === id) ?? null;
  }

  async list(): Promise<IEvent[]> {
    return [...this.events];
  }

  async findMany(query: FindEventsQuery): Promise<IEvent[]> {
    const statuses = query.status === undefined
      ? null
      : Array.isArray(query.status) ? query.status : [query.status];
    const search = query.search ? query.search.trim().toLowerCase() : "";

    return this.events.filter((event) => {
      if (statuses && !statuses.includes(event.status)) return false;
      if (query.organizerId && event.organizerId !== query.organizerId) return false;
      if (query.category && event.category !== query.category) return false;
      if (query.startAfter && event.startAt <= query.startAfter) return false;
      if (query.startBefore && event.startAt > query.startBefore) return false;
      if (search) {
        const haystack = `${event.title} ${event.description} ${event.location}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  async create(event: IEvent): Promise<IEvent> {
    this.events.push(event);
    return event;
  }

  async update(id: string, changes: Partial<IEvent>): Promise<IEvent | null> {
    const index = this.events.findIndex((e) => e.id === id);
    if (index === -1) return null;
    Object.assign(this.events[index], changes);
    this.events[index].updatedAt = new Date();
    return this.events[index];
  }
}

export function CreateInMemoryEventRepository(): IEventRepository {
  return new InMemoryEventRepository();
}
