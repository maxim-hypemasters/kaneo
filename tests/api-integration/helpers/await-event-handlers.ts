import type * as Events from "../../../apps/api/src/events";

// The factory body for `vi.mock` of the events module: publishEvent resolves
// once every subscriber is done, so assertions, and the next test's TRUNCATE,
// never race background work such as time off sockets and notifications.
export async function awaitEventHandlers(
  importOriginal: <T>() => Promise<T>,
): Promise<typeof Events> {
  const events = await importOriginal<typeof Events>();
  return {
    ...events,
    publishEvent: (eventType, data) =>
      events.publishEvent(eventType, data, { waitForHandlers: true }),
  };
}
