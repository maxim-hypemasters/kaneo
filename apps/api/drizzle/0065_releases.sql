CREATE TABLE "release" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"code_freeze_date" date NOT NULL,
	"submission_date" date NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "release_project_id_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "release_project_name_unique" UNIQUE("project_id","name"),
	CONSTRAINT "release_dates_order_check" CHECK ("release"."start_date" <= "release"."code_freeze_date" and "release"."code_freeze_date" <= "release"."submission_date")
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "release_id" text;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_release_fk" FOREIGN KEY ("project_id","release_id") REFERENCES "public"."release"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_releaseId_idx" ON "task" USING btree ("release_id") WHERE "task"."release_id" is not null;