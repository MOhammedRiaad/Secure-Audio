-- AlterTable
ALTER TABLE "AudioFile" ADD COLUMN     "encryptionIV" TEXT,
ADD COLUMN     "encryptionKey" TEXT,
ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false;
