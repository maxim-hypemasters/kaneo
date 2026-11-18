CREATE TABLE "test_case" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"steps" text,
	"expected_result" text,
	"status" text DEFAULT 'not_run' NOT NULL,
	"milestone_id" text,
	"bug_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "test_case_status_check" CHECK ("test_case"."status" in ('not_run', 'passed', 'failed', 'blocked'))
);
--> statement-breakpoint
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_bug_id_task_id_fk" FOREIGN KEY ("bug_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "test_case_project_created_idx" ON "test_case" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "test_case_milestone_id_idx" ON "test_case" USING btree ("milestone_id") WHERE "test_case"."milestone_id" is not null;--> statement-breakpoint
CREATE INDEX "test_case_bug_id_idx" ON "test_case" USING btree ("bug_id") WHERE "test_case"."bug_id" is not null;