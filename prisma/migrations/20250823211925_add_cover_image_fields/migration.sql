-- AlterTable
ALTER TABLE "AudioFile" ADD COLUMN     "cover_image_base64" TEXT,
ADD COLUMN     "cover_image_mime_type" TEXT,
ADD COLUMN     "cover_image_path" TEXT;
