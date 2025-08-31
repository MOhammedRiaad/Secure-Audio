-- CreateEnum
CREATE TYPE "ChunkUploadStatus" AS ENUM ('pending', 'uploading', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "chunk_upload_sessions" (
    "id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "total_chunks" INTEGER NOT NULL,
    "uploaded_chunks" INTEGER NOT NULL DEFAULT 0,
    "status" "ChunkUploadStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chunk_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chunk_upload_sessions_upload_id_key" ON "chunk_upload_sessions"("upload_id");
