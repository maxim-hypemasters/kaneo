CREATE TABLE "document_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"project_document_id" text,
	"feature_document_id" text,
	"parent_id" text,
	"user_id" text,
	"content" text NOT NULL,
	"anchor_quote" text,
	"anchor_prefix" text,
	"anchor_suffix" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"edited_at" timestamp,
	CONSTRAINT "document_comment_target_check" CHECK (("document_comment"."project_document_id" is null) <> ("document_comment"."feature_document_id" is null)),
	CONSTRAINT "document_comment_shape_check" CHECK (("document_comment"."parent_id" is null and "document_comment"."anchor_quote" is not null and "document_comment"."anchor_prefix" is not null and "document_comment"."anchor_suffix" is not null) or ("document_comment"."parent_id" is not null and "document_comment"."anchor_quote" is null and "document_comment"."anchor_prefix" is null and "document_comment"."anchor_suffix" is null and "document_comment"."resolved_at" is null and "document_comment"."resolved_by" is null))
);
--> statement-breakpoint
ALTER TABLE "document_comment" ADD CONSTRAINT "document_comment_project_document_id_project_document_id_fk" FOREIGN KEY ("project_document_id") REFERENCES "public"."project_document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document_comment" ADD CONSTRAINT "document_comment_feature_document_id_feature_document_id_fk" FOREIGN KEY ("feature_document_id") REFERENCES "public"."feature_document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document_comment" ADD CONSTRAINT "document_comment_parent_id_document_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document_comment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document_comment" ADD CONSTRAINT "document_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document_comment" ADD CONSTRAINT "document_comment_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "document_comment_project_document_idx" ON "document_comment" USING btree ("project_document_id","created_at","id") WHERE "document_comment"."project_document_id" is not null;--> statement-breakpoint
CREATE INDEX "document_comment_feature_document_idx" ON "document_comment" USING btree ("feature_document_id","created_at","id") WHERE "document_comment"."feature_document_id" is not null;--> statement-breakpoint
CREATE INDEX "document_comment_parent_idx" ON "document_comment" USING btree ("parent_id") WHERE "document_comment"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "document_comment_user_idx" ON "document_comment" USING btree ("user_id");