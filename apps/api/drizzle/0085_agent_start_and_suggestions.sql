ALTER TABLE "agent_run" DROP CONSTRAINT "agent_run_kind_check";--> statement-breakpoint
ALTER TABLE "agent_run" ADD COLUMN "moved_task" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_agent_assessment" ADD COLUMN "dismissed_suggestion_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_agent_runner" ADD COLUMN "can_push" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_active_work_uidx" ON "agent_run" USING btree ("task_id") WHERE "agent_run"."kind" in ('ship', 'start') and "agent_run"."status" in ('queued', 'running');--> statement-breakpoint
DROP INDEX "agent_run_active_ship_uidx";--> statement-breakpoint
ALTER TABLE "task_agent_assessment" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "task_agent_assessment" DROP COLUMN "checklist";--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_kind_check" CHECK ("agent_run"."kind" in ('assess', 'ship', 'start'));
