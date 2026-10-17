-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'REVIEWER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED');
CREATE TYPE "WorkerStatus" AS ENUM ('IDLE', 'BUSY', 'PAUSED', 'OFFLINE');
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'CLAIMED', 'RUNNING', 'WAITING_USER', 'PAUSED', 'NEEDS_REVIEW', 'SUCCESS', 'FAILED', 'CANCELLED');
CREATE TYPE "RegistrationStep" AS ENUM ('OPEN_SIGNUP', 'PERSONAL_INFO', 'BIRTHDAY_GENDER', 'USERNAME', 'PASSWORD', 'PHONE_VERIFICATION', 'ADDITIONAL_VERIFICATION', 'REVIEW', 'RESULT_CONFIRMATION');
CREATE TYPE "VerificationType" AS ENUM ('PHONE', 'CAPTCHA', 'ADDITIONAL_IDENTITY', 'OTHER');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'FAILED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "username" TEXT NOT NULL, "password_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'OPERATOR', "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE TABLE "accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "first_name" TEXT NOT NULL, "last_name" TEXT NOT NULL,
  "birthday" DATE NOT NULL, "gender" "Gender" NOT NULL, "desired_username" TEXT NOT NULL,
  "password_ciphertext" TEXT NOT NULL, "phone_reference" TEXT NOT NULL, "recovery_email" TEXT,
  "consent_status" "ConsentStatus" NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounts_desired_username_key" ON "accounts"("desired_username");

CREATE TABLE "workers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "device_name" TEXT NOT NULL, "profile_identifier" TEXT NOT NULL,
  "extension_version" TEXT NOT NULL, "token_hash" TEXT NOT NULL, "status" "WorkerStatus" NOT NULL DEFAULT 'IDLE',
  "is_enabled" BOOLEAN NOT NULL DEFAULT true, "current_task_id" UUID, "last_heartbeat_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workers_profile_identifier_key" ON "workers"("profile_identifier");
CREATE UNIQUE INDEX "workers_token_hash_key" ON "workers"("token_hash");
CREATE UNIQUE INDEX "workers_current_task_id_key" ON "workers"("current_task_id");
CREATE INDEX "workers_status_last_heartbeat_at_idx" ON "workers"("status", "last_heartbeat_at");

CREATE TABLE "tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "worker_id" UUID,
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING', "current_step" "RegistrationStep" NOT NULL DEFAULT 'OPEN_SIGNUP',
  "priority" INTEGER NOT NULL DEFAULT 0, "lease_token_hash" TEXT, "lease_version" INTEGER NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMPTZ(3), "started_at" TIMESTAMPTZ(3), "completed_at" TIMESTAMPTZ(3),
  "failure_code" TEXT, "failure_message" TEXT, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tasks_status_priority_created_at_idx" ON "tasks"("status", "priority", "created_at");
CREATE INDEX "tasks_worker_id_status_idx" ON "tasks"("worker_id", "status");
CREATE UNIQUE INDEX "tasks_one_active_per_account" ON "tasks"("account_id") WHERE "status" IN ('PENDING', 'CLAIMED', 'RUNNING', 'WAITING_USER', 'PAUSED', 'NEEDS_REVIEW');
CREATE UNIQUE INDEX "tasks_one_active_per_worker" ON "tasks"("worker_id") WHERE "worker_id" IS NOT NULL AND "status" IN ('CLAIMED', 'RUNNING', 'WAITING_USER', 'PAUSED', 'NEEDS_REVIEW');

CREATE TABLE "task_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "task_id" UUID NOT NULL, "worker_id" UUID,
  "idempotency_key" UUID, "event_type" TEXT NOT NULL, "step" "RegistrationStep", "message" TEXT,
  "metadata" JSONB, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_events_idempotency_key_key" ON "task_events"("idempotency_key");
CREATE INDEX "task_events_task_id_created_at_idx" ON "task_events"("task_id", "created_at");

CREATE TABLE "verification_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "task_id" UUID NOT NULL, "phone_reference" TEXT,
  "provider" TEXT NOT NULL, "verification_type" "VerificationType" NOT NULL,
  "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING', "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "verification_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verification_sessions_status_expires_at_idx" ON "verification_sessions"("status", "expires_at");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actor_id" UUID, "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL, "resource_id" TEXT, "result" TEXT NOT NULL, "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
