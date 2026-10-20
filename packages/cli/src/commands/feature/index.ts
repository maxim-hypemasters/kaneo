import { Command } from "effect/cli";
import { featureArchive, featureUnarchive } from "./archive.js";
import { featureList } from "./list.js";
export const feature = Command.make("feature").pipe(
  Command.withDescription("Browse and archive knowledge Features"),
  Command.withSubcommands([featureList, featureArchive, featureUnarchive]),
);
