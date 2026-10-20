import { Command } from "effect/cli";
import { milestoneCreate } from "./create.js";
import { milestoneDelete } from "./delete.js";
import { milestoneEdit } from "./edit.js";
import { milestoneProjectList } from "./list-project.js";
import { milestoneList } from "./list.js";
import { milestoneOrder } from "./order.js";
import { milestoneView } from "./view.js";
export const milestone = Command.make("milestone").pipe(
  Command.withDescription("Manage milestones owned by Features"),
  Command.withSubcommands([
    milestoneList,
    milestoneProjectList,
    milestoneView,
    milestoneCreate,
    milestoneEdit,
    milestoneOrder,
    milestoneDelete,
  ]),
);
