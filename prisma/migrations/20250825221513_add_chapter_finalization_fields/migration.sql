-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('pending', 'ready', 'failed');

-- AlterTable
ALTER TABLE "AudioChapter" ADD COLUMN     "encrypted_data" BYTEA,
ADD COLUMN     "encrypted_path" TEXT,
ADD COLUMN     "encrypted_size" INTEGER,
ADD COLUMN     "encryption_iv" TEXT,
ADD COLUMN     "encryption_tag" TEXT,
ADD COLUMN     "finalized_at" TIMESTAMP(3),
ADD COLUMN     "plain_size" INTEGER,
ADD COLUMN     "status" "ChapterStatus" NOT NULL DEFAULT 'pending';
