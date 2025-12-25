/*
  Warnings:

  - You are about to drop the `VideoJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'GENERATING', 'AVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "VideoJob" DROP CONSTRAINT "VideoJob_userId_fkey";

-- DropTable
DROP TABLE "VideoJob";

-- DropEnum
DROP TYPE "JobStatus";

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "telegramFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRequest" (
    "id" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "userId" BIGINT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_name_key" ON "VideoAsset"("name");

-- CreateIndex
CREATE INDEX "VideoAsset_name_status_idx" ON "VideoAsset"("name", "status");

-- CreateIndex
CREATE INDEX "UserRequest_userId_status_idx" ON "UserRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "UserRequest_assetId_status_idx" ON "UserRequest"("assetId", "status");

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRequest" ADD CONSTRAINT "UserRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "VideoAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
