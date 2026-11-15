/**
 * One-time backfill: encrypt stored Meta access tokens at rest.
 *
 * SocialAccount.accessToken rows written before token encryption
 * landed hold plaintext OAuth tokens. This script converts them to
 * the `enc:v1:` AES-256-GCM format (see src/social/token-crypto.ts).
 * Already-encrypted rows are skipped, so the script is idempotent.
 *
 * DRY-RUN BY DEFAULT — pass --apply to write.
 * Requires TOKEN_ENCRYPTION_KEY (base64 32 bytes) in the environment.
 *
 * Run (from apps/api, with DATABASE_URL + TOKEN_ENCRYPTION_KEY set —
 * e.g. inside the api container, where the environment is loaded):
 *   npx ts-node scripts/encrypt-social-tokens.ts            # dry run
 *   npx ts-node scripts/encrypt-social-tokens.ts --apply    # write
 */
import { PrismaClient } from '@prisma/client';
import { encryptToken, tokenNeedsEncryption } from '../src/social/token-crypto';

async function main() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set — refusing to run (tokens would be stored unencrypted)',
    );
  }
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { accessToken: { not: null } },
      select: { id: true, userId: true, platform: true, accessToken: true },
    });

    console.log(
      `Scanning ${accounts.length} social account(s) with tokens (${apply ? 'APPLY' : 'DRY RUN'})...`,
    );
    let converted = 0;
    for (const account of accounts) {
      if (!tokenNeedsEncryption(account.accessToken)) {
        console.log(
          `SKIP    account ${account.id} (${account.platform}) — already encrypted`,
        );
        continue;
      }
      console.log(
        `ENCRYPT account ${account.id} (${account.platform}, user ${account.userId})`,
      );
      converted++;
      if (apply) {
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { accessToken: encryptToken(account.accessToken as string) },
        });
      }
    }
    console.log(
      `${converted} token(s) ${apply ? 'encrypted' : 'would be encrypted'}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
