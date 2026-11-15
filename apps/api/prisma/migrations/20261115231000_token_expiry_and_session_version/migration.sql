-- Token expiry for email-verification and password-reset tokens, plus a
-- per-user session version so a successful password reset revokes JWTs
-- issued before the reset.
ALTER TABLE "User" ADD COLUMN "verificationTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "resetPasswordTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
