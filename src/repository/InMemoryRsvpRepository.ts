import type { IRsvp, IRsvpRepository } from "../contracts";

class InMemoryRsvpRepository implements IRsvpRepository {
  private readonly rsvps: IRsvp[] = [];

  async findByEventAndUser(eventId: string, userId: string): Promise<IRsvp | null> {
    return this.rsvps.find((r) => r.eventId === eventId && r.userId === userId) ?? null;
  }

  async findByEvent(eventId: string): Promise<IRsvp[]> {
    return this.rsvps.filter((r) => r.eventId === eventId);
  }

  async findByUser(userId: string): Promise<IRsvp[]> {
    return this.rsvps.filter((r) => r.userId === userId);
  }

  async create(rsvp: IRsvp): Promise<IRsvp> {
    this.rsvps.push(rsvp);
    return rsvp;
  }

  async update(id: string, changes: Partial<IRsvp>): Promise<IRsvp | null> {
    const index = this.rsvps.findIndex((r) => r.id === id);
    if (index === -1) return null;
    Object.assign(this.rsvps[index], changes);
    return this.rsvps[index];
  }

  async countGoingByEvent(eventId: string): Promise<number> {
    return this.rsvps.filter((r) => r.eventId === eventId && r.status === "going").length;
  }
}

export function CreateInMemoryRsvpRepository(): IRsvpRepository {
  return new InMemoryRsvpRepository();
}
