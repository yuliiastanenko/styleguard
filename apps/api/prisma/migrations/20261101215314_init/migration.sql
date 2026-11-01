-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('queued', 'generating', 'uploading', 'checking', 'done', 'failed');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('pending', 'ok', 'check_unavailable');

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandVersion" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "stylePrompt" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "palette" TEXT[],
    "threshold" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" "GenerationStatus" NOT NULL DEFAULT 'queued',
    "brandVersionId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptTemplateVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "seed" INTEGER,
    "latencyMs" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "imageKey" TEXT,
    "imageUrl" TEXT,
    "checkStatus" "CheckStatus" NOT NULL DEFAULT 'pending',
    "judgeModel" TEXT,
    "judgePromptVersion" TEXT,
    "score" DOUBLE PRECISION,
    "reasons" TEXT,
    "paletteMatch" DOUBLE PRECISION,
    "onBrand" BOOLEAN,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVersion_brandId_version_key" ON "BrandVersion"("brandId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Generation_idempotencyKey_key" ON "Generation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Generation_brandVersionId_createdAt_idx" ON "Generation"("brandVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "Generation_model_createdAt_idx" ON "Generation"("model", "createdAt");

-- CreateIndex
CREATE INDEX "Generation_status_idx" ON "Generation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Job_generationId_key" ON "Job"("generationId");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");

-- AddForeignKey
ALTER TABLE "BrandVersion" ADD CONSTRAINT "BrandVersion_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_brandVersionId_fkey" FOREIGN KEY ("brandVersionId") REFERENCES "BrandVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
