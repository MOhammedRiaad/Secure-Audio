-- AlterTable
ALTER TABLE "users" ADD COLUMN     "max_devices" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "active_sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT,
    "device_type" TEXT,
    "device_fingerprint" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "active_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_notifications" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT,
    "ip_address" TEXT NOT NULL,
    "location" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "notification_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "active_sessions_user_id_device_id_key" ON "active_sessions"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_notifications" ADD CONSTRAINT "device_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
