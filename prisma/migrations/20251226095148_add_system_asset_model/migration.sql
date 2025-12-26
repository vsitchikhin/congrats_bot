-- CreateTable
CREATE TABLE "SystemAsset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "telegramFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemAsset_key_key" ON "SystemAsset"("key");

-- CreateIndex
CREATE INDEX "SystemAsset_key_idx" ON "SystemAsset"("key");
