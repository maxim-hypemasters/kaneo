import { Result } from "effect";
import { InvalidArgument } from "../errors/errors.js";

export function parseEstimateSeconds(
  value: string,
): Result.Result<number | null, InvalidArgument> {
  if (value.trim().toLowerCase() === "none") return Result.succeed(null);
  const seconds = Number(value);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    seconds % 60 !== 0 ||
    seconds > 2_147_483_640
  )
    return Result.fail(
      new InvalidArgument({
        message:
          "--estimate-seconds must be a positive number of whole minutes, or none.",
        hint: "For example, 5400 means 1.5 hours. Dates are calculated by project Preview/Apply planning.",
      }),
    );
  return Result.succeed(seconds);
}
