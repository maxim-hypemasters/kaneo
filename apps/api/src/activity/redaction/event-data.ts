export type EventData = Record<string, unknown>;

export function eventDataOf(value: unknown): EventData | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EventData)
    : null;
}
