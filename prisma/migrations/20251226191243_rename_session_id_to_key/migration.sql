-- AlterTable: Rename 'id' column to 'key' in Session table
ALTER TABLE "Session" RENAME COLUMN "id" TO "key";

-- DropIndex: Drop old index on 'id'
DROP INDEX "Session_id_idx";

-- CreateIndex: Create new index on 'key'
CREATE INDEX "Session_key_idx" ON "Session"("key");
