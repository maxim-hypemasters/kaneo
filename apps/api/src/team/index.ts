import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createTeam from "./controllers/create-team";
import deleteTeam from "./controllers/delete-team";
import listTeams from "./controllers/list-teams";
import replaceTeamMembers from "./controllers/replace-team-members";
import replaceTeamProjects from "./controllers/replace-team-projects";
import updateTeam from "./controllers/update-team";
import { deletedTeamSchema, teamListSchema, teamSchema } from "./response";
import {
  teamMembersBody,
  teamNameBody,
  teamParam,
  teamProjectsBody,
  workspaceIdParam,
} from "./schema";

const listTeamsRoute = createRoute({
  method: "get",
  operationId: "listTeams",
  path: "/workspace/{workspaceId}",
  tags: ["Teams"],
  summary: "List teams",
  description:
    "List the workspace's teams with their members and linked projects. Any workspace member can read them; linked projects the viewer can't access are left out.",
  middleware: [workspaceAccess.fromParam()] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("Teams in the workspace", teamListSchema),
    404: errorResponse("Workspace not found"),
  },
});

const createTeamRoute = createRoute({
  method: "post",
  operationId: "createTeam",
  path: "/workspace/{workspaceId}",
  tags: ["Teams"],
  summary: "Create team",
  description: "Create an empty team in the workspace.",
  middleware: [
    workspaceAccess.fromParam(),
    requireWorkspacePermission({ team: ["create"] }),
  ] as const,
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: teamNameBody } },
    },
  },
  responses: {
    200: jsonResponse("Team created", teamSchema),
    400: errorResponse("Invalid name"),
    403: errorResponse("Missing team:create permission"),
    404: errorResponse("Workspace not found"),
    409: errorResponse("A team with this name already exists"),
  },
});

const updateTeamRoute = createRoute({
  method: "patch",
  operationId: "updateTeam",
  path: "/{id}",
  tags: ["Teams"],
  summary: "Rename team",
  description: "Rename a team.",
  middleware: [
    workspaceAccess.fromTeam(),
    requireWorkspacePermission({ team: ["update"] }),
  ] as const,
  request: {
    params: teamParam,
    body: {
      required: true,
      content: { "application/json": { schema: teamNameBody } },
    },
  },
  responses: {
    200: jsonResponse("Team renamed", teamSchema),
    400: errorResponse("Invalid name"),
    403: errorResponse("Missing team:update permission"),
    404: errorResponse("Team not found"),
    409: errorResponse("A team with this name already exists"),
  },
});

const deleteTeamRoute = createRoute({
  method: "delete",
  operationId: "deleteTeam",
  path: "/{id}",
  tags: ["Teams"],
  summary: "Delete team",
  description:
    "Delete a team. Members lose projects they could only open through it, leave those projects' triage lists, and are unassigned from tasks there.",
  middleware: [
    workspaceAccess.fromTeam(),
    requireWorkspacePermission({ team: ["delete"] }),
  ] as const,
  request: { params: teamParam },
  responses: {
    200: jsonResponse("Team deleted", deletedTeamSchema),
    403: errorResponse(
      "Missing team:delete permission, or the team is linked to projects you can't access",
    ),
    404: errorResponse("Team not found"),
  },
});

const replaceTeamMembersRoute = createRoute({
  method: "put",
  operationId: "replaceTeamMembers",
  path: "/{id}/members",
  tags: ["Teams"],
  summary: "Set team members",
  description:
    "Replace the team's members. New members can open the team's linked projects; removed members lose projects they could only open through the team.",
  middleware: [
    workspaceAccess.fromTeam(),
    requireWorkspacePermission({ team: ["update"] }),
  ] as const,
  request: {
    params: teamParam,
    body: {
      required: true,
      content: { "application/json": { schema: teamMembersBody } },
    },
  },
  responses: {
    200: jsonResponse("Team members updated", teamSchema),
    400: errorResponse("A user is not a member of the workspace"),
    403: errorResponse(
      "Missing team:update permission, or the team is linked to projects you can't access",
    ),
    404: errorResponse("Team not found"),
  },
});

const replaceTeamProjectsRoute = createRoute({
  method: "put",
  operationId: "replaceTeamProjects",
  path: "/{id}/projects",
  tags: ["Teams"],
  summary: "Set team projects",
  description:
    "Replace the projects linked to the team. Its members can open linked projects even when their own project access is limited. You can only link projects you can access, and links to projects you can't access are kept.",
  middleware: [
    workspaceAccess.fromTeam(),
    requireWorkspacePermission({ team: ["update"] }),
  ] as const,
  request: {
    params: teamParam,
    body: {
      required: true,
      content: { "application/json": { schema: teamProjectsBody } },
    },
  },
  responses: {
    200: jsonResponse("Team projects updated", teamSchema),
    400: errorResponse("A project doesn't belong to the workspace"),
    403: errorResponse(
      "Missing team:update permission, or a project you can't access",
    ),
    404: errorResponse("Team not found"),
  },
});

const team = apiRouter()
  .openapi(listTeamsRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    return c.json(await listTeams(workspaceId, c.get("userId")), 200);
  })
  .openapi(createTeamRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    const { name } = c.req.valid("json");
    return c.json(
      await createTeam({
        workspaceId,
        name,
        actorId: c.get("userId"),
      }),
      200,
    );
  })
  .openapi(updateTeamRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { name } = c.req.valid("json");
    return c.json(
      await updateTeam({ teamId: id, name, actorId: c.get("userId") }),
      200,
    );
  })
  .openapi(deleteTeamRoute, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(
      await deleteTeam({ teamId: id, actorId: c.get("userId") }),
      200,
    );
  })
  .openapi(replaceTeamMembersRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { userIds } = c.req.valid("json");
    return c.json(
      await replaceTeamMembers({
        teamId: id,
        userIds,
        actorId: c.get("userId"),
      }),
      200,
    );
  })
  .openapi(replaceTeamProjectsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { projectIds } = c.req.valid("json");
    return c.json(
      await replaceTeamProjects({
        teamId: id,
        projectIds,
        actorId: c.get("userId"),
      }),
      200,
    );
  });

export default team;
