CREATE TABLE "amenities" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text NOT NULL,
	"category" text,
	CONSTRAINT "amenities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"listings_extracted" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"source" text NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"message" text,
	"locale" text DEFAULT 'es' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"source_listing_id" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"property_type" text NOT NULL,
	"listing_type" text NOT NULL,
	"price_cents" bigint,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"bedrooms" smallint,
	"bathrooms" numeric(3, 1),
	"construction_m2" numeric,
	"land_m2" numeric,
	"parking_spaces" smallint,
	"country" text DEFAULT 'MX' NOT NULL,
	"state" text NOT NULL,
	"city" text NOT NULL,
	"neighborhood" text,
	"address" text,
	"postal_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_es" jsonb,
	"content_en" jsonb,
	"content_fr" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_crawl_run_id" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "properties_source_unique" UNIQUE("source_id","source_listing_id")
);
--> statement-breakpoint
CREATE TABLE "property_amenities" (
	"property_id" uuid NOT NULL,
	"amenity_id" serial NOT NULL,
	CONSTRAINT "property_amenities_property_id_amenity_id_pk" PRIMARY KEY("property_id","amenity_id")
);
--> statement-breakpoint
CREATE TABLE "property_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"original_url" text NOT NULL,
	"raw_url" text,
	"clean_url" text,
	"alt_text" text,
	"width" integer,
	"height" integer,
	"has_watermark_removed" boolean DEFAULT false NOT NULL,
	"watermark_removal_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"crawl_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"watermark_config" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL,
	"extraction_schema" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_crawled_at" timestamp with time zone,
	CONSTRAINT "sources_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_last_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("last_crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_changes" ADD CONSTRAINT "property_changes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_changes" ADD CONSTRAINT "property_changes_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;