import { Command } from "effect/cli";
import { releaseCreate } from "./create.js";
import { releaseDelete } from "./delete.js";
import { releaseEdit } from "./edit.js";
import { releaseList } from "./list.js";

export const release = Command.make("release").pipe(
  Command.withDescription(
    "Plan a project's releases: start, code freeze and submission dates",
  ),
  Command.withSubcommands([
    releaseList,
    releaseCreate,
    releaseEdit,
    releaseDelete,
  ]),
);
