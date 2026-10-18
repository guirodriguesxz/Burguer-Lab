-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "clientRef" TEXT,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pixPayload" TEXT,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "txid" TEXT,
ALTER COLUMN "paidAt" DROP NOT NULL,
ALTER COLUMN "paidAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrderCents" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientRef_key" ON "Order"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txid_key" ON "Payment"("txid");

