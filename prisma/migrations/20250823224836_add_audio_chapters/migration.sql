-- CreateTable
CREATE TABLE "AudioChapter" (
    "id" SERIAL NOT NULL,
    "fileId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" DOUBLE PRECISION NOT NULL,
    "endTime" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioChapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioChapter_fileId_order_key" ON "AudioChapter"("fileId", "order");

-- AddForeignKey
ALTER TABLE "AudioChapter" ADD CONSTRAINT "AudioChapter_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "AudioFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
