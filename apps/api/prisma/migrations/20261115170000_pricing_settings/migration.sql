-- Margin engine + caption footer (reseller pricing rules)
ALTER TABLE "Settings" ADD COLUMN "marginType" TEXT NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Settings" ADD COLUMN "marginValue" DOUBLE PRECISION NOT NULL DEFAULT 30;
ALTER TABLE "Settings" ADD COLUMN "priceRounding" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Settings" ADD COLUMN "captionFooter" TEXT;
