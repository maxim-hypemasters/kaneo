CREATE TABLE "project_document" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"parent_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_by_name" text,
	"updated_by_name" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "document_id" text;--> statement-breakpoint
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_parent_id_project_document_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."project_document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "project_document_tree_idx" ON "project_document" USING btree ("project_id","parent_id","position","id");--> statement-breakpoint
CREATE INDEX "project_document_parent_idx" ON "project_document" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_document_id_project_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_documentId_idx" ON "asset" USING btree ("document_id");