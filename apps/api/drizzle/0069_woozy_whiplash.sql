ALTER TABLE "milestone" RENAME COLUMN "target_date" TO "end_date";--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_date_order_check" CHECK ("milestone"."start_date" is null or "milestone"."end_date" is null or "milestone"."start_date" <= "milestone"."end_date");