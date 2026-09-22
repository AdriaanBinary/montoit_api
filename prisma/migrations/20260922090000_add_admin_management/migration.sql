ALTER TABLE "users"
  ADD COLUMN "suspended_at" TIMESTAMPTZ(6),
  ADD COLUMN "suspension_reason" TEXT;

CREATE INDEX "users_role_suspended_at_created_at_idx"
  ON "users"("role", "suspended_at", "created_at");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" VARCHAR(16) NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "entity_id" VARCHAR(100) NOT NULL,
  "metadata" JSONB,
  "request_id" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx"
  ON "audit_logs"("entity_type", "entity_id", "created_at");

CREATE INDEX "audit_logs_actor_id_created_at_idx"
  ON "audit_logs"("actor_id", "created_at");

CREATE INDEX "audit_logs_created_at_idx"
  ON "audit_logs"("created_at");
