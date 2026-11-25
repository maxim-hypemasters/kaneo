CREATE TABLE "test_case_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"test_case_id" text NOT NULL,
	"user_id" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "test_case_id" text;--> statement-breakpoint
ALTER TABLE "test_case_comment" ADD CONSTRAINT "test_case_comment_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "test_case_comment" ADD CONSTRAINT "test_case_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "test_case_comment_thread_idx" ON "test_case_comment" USING btree ("test_case_id","created_at","id");--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_testCaseId_idx" ON "asset" USING btree ("test_case_id") WHERE "asset"."test_case_id" is not null;