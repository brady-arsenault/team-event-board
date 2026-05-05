import type {
  IEvent,
  IEventRepository,
  SearchEventsError,
  SearchEventsInput,
} from "../contracts";
import { InvalidInputError } from "../contracts";
import { Err, Ok, Result } from "../lib/result";

const MAX_QUERY_LENGTH = 500;

export interface IEventSearchService {
  searchEvents(
    input: SearchEventsInput,
  ): Promise<Result<IEvent[], SearchEventsError>>;
}

class EventSearchService implements IEventSearchService {
  constructor(private readonly eventRepository: IEventRepository) {}

  async searchEvents(
    input: SearchEventsInput,
  ): Promise<Result<IEvent[], SearchEventsError>> {
    const query = input.query ?? "";
    if (query.length > MAX_QUERY_LENGTH) {
      return Err(
        InvalidInputError(
          `Query must be at most ${MAX_QUERY_LENGTH} characters.`,
        ),
      );
    }

    const now = new Date();
    const matched = await this.eventRepository.findMany({
      status: "published",
      startAfter: now,
      search: query.trim() === "" ? undefined : query,
    });

    matched.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    return Ok(matched);
  }
}

export function CreateEventSearchService(
  eventRepository: IEventRepository,
): IEventSearchService {
  return new EventSearchService(eventRepository);
}
