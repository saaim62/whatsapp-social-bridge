-- Per-destination publish idempotency (P0-3).
--
-- publishedKey is "<batchId>:<platform>" on the LIVE published record
-- and NULL on every other row (failed attempts, superseded records).
-- Postgres unique indexes treat NULLs as distinct, so any number of
-- non-live rows can coexist, while at most ONE live PUBLISHED record
-- can exist per (batch, platform). A retry therefore cannot create a
-- second live record for a destination that already succeeded; a
-- force re-publish supersedes the old record (status SUPERSEDED,
-- publishedKey cleared) and writes a new live one in the same
-- transaction.
ALTER TABLE "Publication" ADD COLUMN "publishedKey" TEXT;
CREATE UNIQUE INDEX "Publication_publishedKey_key" ON "Publication"("publishedKey");
