CREATE TABLE "project_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"generation" integer NOT NULL,
	"input_revision" text NOT NULL,
	"as_of" timestamp NOT NULL,
	"plan_from" timestamp NOT NULL,
	"time_zone" text NOT NULL,
	"applied_by" text,
	"applied_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"placements" jsonb NOT NULL,
	CONSTRAINT "project_plan_project_generation_unique" UNIQUE("project_id","generation")
);
--> statement-breakpoint
ALTER TABLE "project_plan" ADD CONSTRAINT "project_plan_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plan" ADD CONSTRAINT "project_plan_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;