ALTER TABLE "capabilities" RENAME COLUMN "name_i18n_key" TO "name";--> statement-breakpoint
ALTER TABLE "capabilities" DROP COLUMN "description_i18n_key";