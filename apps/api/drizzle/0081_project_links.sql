CREATE TABLE "project_link" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_link" ADD CONSTRAINT "project_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "project_link_projectId_position_idx" ON "project_link" USING btree ("project_id","position");