-- Server-side OAuth state nonces for the Meta connect flow. The state
-- parameter is a random nonce bound to the initiating user with a short
-- TTL, consumed exactly once at callback — it no longer encodes the
-- userId (base64), which anyone could forge for another account.
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthState_nonce_key" ON "OAuthState"("nonce");
CREATE INDEX "OAuthState_userId_idx" ON "OAuthState"("userId");
