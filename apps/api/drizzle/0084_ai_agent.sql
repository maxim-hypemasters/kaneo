CREATE TABLE "agent_run_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "agent_run_event_kind_check" CHECK ("agent_run_event"."kind" in ('step', 'tool', 'log'))
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"not_before" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"input_hash" text NOT NULL,
	"requested_by_user_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp,
	"cancel_requested_at" timestamp,
	"result" jsonb,
	"error_code" text,
	"error" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	CONSTRAINT "agent_run_kind_check" CHECK ("agent_run"."kind" in ('assess', 'ship')),
	CONSTRAINT "agent_run_status_check" CHECK ("agent_run"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "project_agent_setting" (
	"project_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"auto_assess" boolean DEFAULT true NOT NULL,
	"repository" text,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"ready_threshold" integer DEFAULT 80 NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "project_agent_setting_ready_threshold_check" CHECK ("project_agent_setting"."ready_threshold" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "task_agent_assessment" (
	"task_id" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"score" integer NOT NULL,
	"verdict" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"assessed_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "task_agent_assessment_score_check" CHECK ("task_agent_assessment"."score" between 0 and 100),
	CONSTRAINT "task_agent_assessment_verdict_check" CHECK ("task_agent_assessment"."verdict" in ('not_ready', 'needs_clarification', 'ready'))
);
--> statement-breakpoint
CREATE TABLE "task_agent_clarification" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"answered_by_user_id" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_agent_runner" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_seen_at" timestamp,
	"runner_version" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "workspace_agent_runner_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "agent_run_event" ADD CONSTRAINT "agent_run_event_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_agent_setting" ADD CONSTRAINT "project_agent_setting_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_agent_setting" ADD CONSTRAINT "project_agent_setting_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_agent_assessment" ADD CONSTRAINT "task_agent_assessment_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_agent_clarification" ADD CONSTRAINT "task_agent_clarification_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_agent_clarification" ADD CONSTRAINT "task_agent_clarification_answered_by_user_id_user_id_fk" FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_agent_runner" ADD CONSTRAINT "workspace_agent_runner_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_agent_runner" ADD CONSTRAINT "workspace_agent_runner_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "agent_run_event_run_idx" ON "agent_run_event" USING btree ("run_id","id");--> statement-breakpoint
CREATE INDEX "agent_run_claim_idx" ON "agent_run" USING btree ("status","not_before");--> statement-breakpoint
CREATE INDEX "agent_run_task_idx" ON "agent_run" USING btree ("task_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_queued_assess_uidx" ON "agent_run" USING btree ("task_id") WHERE "agent_run"."kind" = 'assess' and "agent_run"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_active_ship_uidx" ON "agent_run" USING btree ("task_id") WHERE "agent_run"."kind" = 'ship' and "agent_run"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "task_agent_clarification_task_idx" ON "task_agent_clarification" USING btree ("task_id","created_at");