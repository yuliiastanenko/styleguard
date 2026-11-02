-- CreateEnum
CREATE TYPE "DriftStatus" AS ENUM ('ok', 'drifting');

-- CreateTable
CREATE TABLE "DriftState" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "DriftStatus" NOT NULL DEFAULT 'ok',
    "mean" DOUBLE PRECISION,
    "samples" INTEGER NOT NULL DEFAULT 0,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriftState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriftState_brandId_model_key" ON "DriftState"("brandId", "model");

-- AddForeignKey
ALTER TABLE "DriftState" ADD CONSTRAINT "DriftState_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
