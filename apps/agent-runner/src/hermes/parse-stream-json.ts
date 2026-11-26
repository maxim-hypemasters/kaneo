import type { ProgressEvent } from "../kaneo/client";

// The records of `hermes chat --format stream-json` (hermes_cli/stream_json.py).
export type HermesRecord =
  | { type: "system"; subtype?: string; model?: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input?: Record<string, unknown> }
  | {
      type: "tool_result";
      name: string;
      output?: string;
      is_error?: boolean;
    }
  | {
      type: "result";
      exit_code: number;
      text: string;
      error?: string;
      session_id?: string;
    };

export function parseRecord(line: string): HermesRecord | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const record = JSON.parse(trimmed) as { type?: unknown };
    return typeof record.type === "string" ? (record as HermesRecord) : null;
  } catch {
    return null;
  }
}

const INPUT_KEYS = ["command", "path", "pattern", "query", "file_path"];

function describeInput(input: Record<string, unknown> | undefined) {
  if (!input) return "";
  for (const key of INPUT_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim())
      return value.trim().split("\n")[0]!.slice(0, 200);
  }
  return "";
}

/** A progress line for the task view, or null for records not worth showing. */
export function toProgressEvent(record: HermesRecord): ProgressEvent | null {
  if (record.type === "tool_use") {
    if (record.name === "todo_list") return null;
    const detail = describeInput(record.input);
    return {
      kind: "tool",
      message: detail ? `${record.name}: ${detail}` : record.name,
    };
  }
  if (record.type === "tool_result" && record.is_error) {
    const firstLine = (record.output ?? "").trim().split("\n")[0] ?? "";
    return {
      kind: "log",
      message: `${record.name} failed${firstLine ? `: ${firstLine.slice(0, 200)}` : ""}`,
    };
  }
  return null;
}
