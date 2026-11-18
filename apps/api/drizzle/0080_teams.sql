-- Better Auth created a team with each workspace (named after it, holding only
-- the creator) that Kaneo never showed. Drop those untouched defaults; teams
-- added later through the API stay.
DELETE FROM "team" AS t
USING "workspace" AS w
WHERE w."id" = t."workspace_id"
  AND t."created_at" BETWEEN w."created_at" - interval '1 minute' AND w."created_at" + interval '1 minute'
  AND (SELECT count(*) FROM "team_member" AS tm WHERE tm."team_id" = t."id") <= 1;--> statement-breakpoint
-- Removing a workspace member never cleared their team rows.
DELETE FROM "team_member" AS tm
USING "team" AS t
WHERE t."id" = tm."team_id"
  AND NOT EXISTS (
    SELECT 1 FROM "workspace_member" AS wm
    WHERE wm."workspace_id" = t."workspace_id" AND wm."user_id" = tm."user_id"
  );--> statement-breakpoint
DELETE FROM "team_member" AS tm
USING "team_member" AS earlier
WHERE earlier."team_id" = tm."team_id"
  AND earlier."user_id" = tm."user_id"
  AND earlier."id" < tm."id";--> statement-breakpoint
UPDATE "team" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
UPDATE "team_member" SET "created_at" = (now() AT TIME ZONE 'utc') WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "team" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc');--> statement-breakpoint
ALTER TABLE "team" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'utc');--> statement-breakpoint
ALTER TABLE "team" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc');--> statement-breakpoint
ALTER TABLE "team_member" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_workspace_id_id_unique" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_user_unique" UNIQUE("team_id","user_id");--> statement-breakpoint
CREATE TABLE "team_project" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "team_project_team_project_unique" UNIQUE("team_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "team_project" ADD CONSTRAINT "team_project_workspace_id_team_id_team_workspace_id_id_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."team"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_project" ADD CONSTRAINT "team_project_workspace_id_project_id_project_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_project_projectId_idx" ON "team_project" USING btree ("project_id");
