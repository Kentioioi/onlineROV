CREATE TYPE "field_key" AS ENUM('location', 'vessel', 'project_leader', 'rov_operator', 'merd_type', 'reason', 'current_strength', 'visibility', 'wild_fish', 'growth', 'condition', 'escalation_contact');--> statement-breakpoint
CREATE TYPE "image_category" AS ENUM('liftup', 'lodd', 'bunn', 'not', 'opphalere', 'annet');--> statement-breakpoint
CREATE TYPE "inspection_category" AS ENUM('liftup', 'lodd', 'bunn', 'not', 'opphalere');--> statement-breakpoint
CREATE TABLE "field_options" (
	"id" serial PRIMARY KEY,
	"field_key" "field_key" NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_options_field_key_value_unique" UNIQUE("field_key","value")
);
--> statement-breakpoint
CREATE TABLE "inspection_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"report_id" uuid NOT NULL,
	"category" "inspection_category" NOT NULL,
	"checked" boolean DEFAULT true NOT NULL,
	"condition" text,
	"comment" text,
	CONSTRAINT "inspection_results_report_category_unique" UNIQUE("report_id","category")
);
--> statement-breakpoint
CREATE TABLE "report_images" (
	"id" uuid PRIMARY KEY,
	"report_id" uuid NOT NULL,
	"category" "image_category" NOT NULL,
	"blob_key" text NOT NULL UNIQUE,
	"original_filename" text,
	"content_type" text,
	"size_bytes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_number_counter" (
	"id" smallint PRIMARY KEY DEFAULT 1,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "report_number_counter_singleton" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY,
	"report_number" integer NOT NULL UNIQUE,
	"date" text NOT NULL,
	"vessel" text,
	"time_from" time,
	"time_to" time,
	"project_leader" text,
	"location" text,
	"rov_operator" text,
	"reason" text,
	"merd_number" text,
	"merd_type" text,
	"size_x" numeric,
	"size_y" numeric,
	"depth" numeric,
	"dead_fish_count" integer,
	"dead_fish_approx" boolean DEFAULT false NOT NULL,
	"current_strength" text,
	"visibility" text,
	"wild_fish" text,
	"wild_fish_note" text,
	"growth" text,
	"comments" text,
	"created_by" text,
	"updated_by" text,
	"pdf_blob_key" text,
	"pdf_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_report_id_reports_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "report_images" ADD CONSTRAINT "report_images_report_id_reports_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;