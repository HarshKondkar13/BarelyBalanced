ALTER TABLE "preferences" ALTER COLUMN "theme" SET DEFAULT 'neon';--> statement-breakpoint
UPDATE "preferences" SET "theme" = 'neon' WHERE "theme" = 'system';
