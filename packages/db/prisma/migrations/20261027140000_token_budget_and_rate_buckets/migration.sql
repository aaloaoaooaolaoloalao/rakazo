-- Additive. Existing users, bots, computers, and usage rows are not changed.
CREATE TABLE "token_budget_holds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "token_budget_holds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "token_budget_holds_callId_key" ON "token_budget_holds"("callId");
CREATE INDEX "token_budget_holds_userId_createdAt_idx" ON "token_budget_holds"("userId", "createdAt");

CREATE TABLE "api_rate_buckets" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "api_rate_buckets_pkey" PRIMARY KEY ("key", "windowStart")
);

ALTER TABLE "token_budget_holds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_rate_buckets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_budget_holds_system" ON "token_budget_holds"
  USING (current_setting('app.rls_bypass', true) = 'on');
CREATE POLICY "api_rate_buckets_system" ON "api_rate_buckets"
  USING (current_setting('app.rls_bypass', true) = 'on');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "token_budget_holds", "api_rate_buckets" TO rakazo_app;
  END IF;
END $$;
