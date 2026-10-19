-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "ticket" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DailyCounter" (
    "date" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("date")
);


-- Pedidos antigos mantêm como senha o número que já tinham.
UPDATE "Order" SET "ticket" = "number" WHERE "ticket" = 0;
