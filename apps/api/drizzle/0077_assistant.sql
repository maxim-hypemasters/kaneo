CREATE TABLE "assistant_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"busy_until" timestamp,
	"busy_token" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_message" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"model" text,
	"tool_calls" jsonb,
	"reasoning_details" jsonb,
	"usage" jsonb,
	"tool_call_id" text,
	"tool_name" text,
	"tool_args" text,
	"approval" text,
	"is_error" boolean DEFAULT false NOT NULL,
	"preview" jsonb,
	"result_summary" jsonb,
	"read_receipts" jsonb,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "assistant_message_role_check" CHECK ("assistant_message"."role" in ('user', 'assistant', 'tool')),
	CONSTRAINT "assistant_message_status_check" CHECK ("assistant_message"."status" in ('complete', 'interrupted')),
	CONSTRAINT "assistant_message_approval_check" CHECK ("assistant_message"."approval" is null or "assistant_message"."approval" in ('pending', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "assistant_usage" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"model_calls" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "assistant_usage_pk" PRIMARY KEY("workspace_id","user_id","day")
);
--> statement-breakpoint
CREATE TABLE "workspace_assistant_setting" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"api_key_ciphertext" text NOT NULL,
	"api_key_hint" text NOT NULL,
	"model" text NOT NULL,
	"allow_data_collection" boolean DEFAULT false NOT NULL,
	"last_error_code" text,
	"last_error_at" timestamp,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "workspace_assistant_setting_last_error_code_check" CHECK ("workspace_assistant_setting"."last_error_code" is null or "workspace_assistant_setting"."last_error_code" in ('OPENROUTER_KEY_INVALID', 'OPENROUTER_CREDITS'))
);
--> statement-breakpoint
ALTER TABLE "assistant_chat" ADD CONSTRAINT "assistant_chat_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assistant_chat" ADD CONSTRAINT "assistant_chat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_chat_id_assistant_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."assistant_chat"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_assistant_setting" ADD CONSTRAINT "workspace_assistant_setting_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_assistant_setting" ADD CONSTRAINT "workspace_assistant_setting_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "assistant_chat_owner_idx" ON "assistant_chat" USING btree ("workspace_id","user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "assistant_message_chat_seq_idx" ON "assistant_message" USING btree ("chat_id","seq");--> statement-breakpoint
CREATE INDEX "assistant_message_pending_idx" ON "assistant_message" USING btree ("chat_id") WHERE "assistant_message"."approval" = 'pending';