-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_id_idx" ON "Session"("id");
