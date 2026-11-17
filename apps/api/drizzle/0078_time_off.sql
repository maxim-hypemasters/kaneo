CREATE TABLE "time_off_allowance" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"days" integer NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "time_off_allowance_workspace_user_type_unique" UNIQUE("workspace_id","user_id","type"),
	CONSTRAINT "time_off_allowance_type_check" CHECK ("time_off_allowance"."type" in ('vacation', 'sick', 'public_holiday')),
	CONSTRAINT "time_off_allowance_days_check" CHECK ("time_off_allowance"."days" between 0 and 366)
);
--> statement-breakpoint
CREATE TABLE "time_off_holiday_calendar_request" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"country" text,
	"region" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"status_changed_by" text,
	"status_changed_at" timestamp,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "time_off_holiday_calendar_request_status_check" CHECK ("time_off_holiday_calendar_request"."status" in ('pending', 'approved', 'declined', 'cancelled')),
	CONSTRAINT "time_off_holiday_calendar_request_region_check" CHECK ("time_off_holiday_calendar_request"."country" is not null or "time_off_holiday_calendar_request"."region" is null)
);
--> statement-breakpoint
CREATE TABLE "time_off_holiday_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"country" text,
	"region" text,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "time_off_holiday_calendar_workspace_user_unique" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "time_off_holiday_calendar_region_check" CHECK ("time_off_holiday_calendar"."country" is not null or "time_off_holiday_calendar"."region" is null)
);
--> statement-breakpoint
CREATE TABLE "time_off_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"default_allowance_days" integer NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "time_off_policy_workspace_type_unique" UNIQUE("workspace_id","type"),
	CONSTRAINT "time_off_policy_type_check" CHECK ("time_off_policy"."type" in ('vacation', 'sick', 'public_holiday')),
	CONSTRAINT "time_off_policy_days_check" CHECK ("time_off_policy"."default_allowance_days" between 0 and 366)
);
--> statement-breakpoint
CREATE TABLE "time_off_setting" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"holiday_calendar_deadline" date,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"status_changed_by" text,
	"status_changed_at" timestamp,
	"planning_key" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "time_off_dates_order_check" CHECK ("time_off"."start_date" <= "time_off"."end_date"),
	CONSTRAINT "time_off_type_check" CHECK ("time_off"."type" in ('vacation', 'sick', 'public_holiday')),
	CONSTRAINT "time_off_status_check" CHECK ("time_off"."status" in ('pending', 'approved', 'declined', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "user_notification_preference" ADD COLUMN "team_time_off_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "time_off_allowance" ADD CONSTRAINT "time_off_allowance_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_allowance" ADD CONSTRAINT "time_off_allowance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_holiday_calendar_request" ADD CONSTRAINT "time_off_holiday_calendar_request_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_holiday_calendar_request" ADD CONSTRAINT "time_off_holiday_calendar_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_holiday_calendar_request" ADD CONSTRAINT "time_off_holiday_calendar_request_status_changed_by_user_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_holiday_calendar" ADD CONSTRAINT "time_off_holiday_calendar_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_holiday_calendar" ADD CONSTRAINT "time_off_holiday_calendar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy" ADD CONSTRAINT "time_off_policy_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_setting" ADD CONSTRAINT "time_off_setting_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_status_changed_by_user_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_off_holiday_calendar_request_pending_unique" ON "time_off_holiday_calendar_request" USING btree ("workspace_id","user_id") WHERE "time_off_holiday_calendar_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "time_off_member_dates_idx" ON "time_off" USING btree ("workspace_id","user_id","start_date");--> statement-breakpoint
CREATE INDEX "time_off_workspace_dates_idx" ON "time_off" USING btree ("workspace_id","end_date","start_date");