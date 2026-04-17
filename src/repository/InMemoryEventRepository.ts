import type { IEvent, IEventRepository } from "../contracts";

class InMemoryEventRepository implements IEventRepository {
  private readonly events: IEvent[] = [];

  async findById(id: string): Promise<IEvent | null> {
    return this.events.find((e) => e.id === id) ?? null;
  }

  async list(): Promise<IEvent[]> {
    return [...this.events];
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
