import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const clean = (val?: string) => val ? val.replace(/^["']|["']$/g, '').trim() : undefined;

const account1 = {
  id: 'account_1',
  accountId: clean(process.env.R2_ACC1_ACCOUNT_ID),
  accessKeyId: clean(process.env.R2_ACC1_ACCESS_KEY_ID),
  secretAccessKey: clean(process.env.R2_ACC1_SECRET_ACCESS_KEY),
  bucketName: clean(process.env.R2_ACC1_BUCKET_NAME) || 'whatsapp-media-1',
  publicUrl: clean(process.env.R2_ACC1_PUBLIC_URL) || 'https://pub-4b5e72d8e2b14be8a0cb7a6c40b423cc.r2.dev',
};

console.log('R2 Sync Config:', {
  bucket: account1.bucketName,
  publicUrl: account1.publicUrl,
  hasKey: !!account1.accessKeyId,
  hasSecret: !!account1.secretAccessKey,
});

if (!account1.accountId || !account1.accessKeyId || !account1.secretAccessKey) {
  console.error('Missing R2 credentials! Exiting.');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${account1.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: account1.accessKeyId,
    secretAccessKey: account1.secretAccessKey,
  },
});

const prisma = new PrismaClient();

async function sync() {
  console.log('--- Starting Cloudflare R2 Media Sync ---');
  
  // Find all media assets that do not have an R2 originalUrl
  const pendingAssets = await prisma.mediaAsset.findMany({
    where: {
      OR: [
        { originalUrl: null },
        { originalUrl: '' },
      ],
    },
  });

  console.log(`Found ${pendingAssets.length} media assets needing R2 upload.`);

  let uploadedCount = 0;
  let missingCount = 0;

  for (const asset of pendingAssets) {
    let filePath: string | null = null;
    const candidates = [
      asset.localPath ? path.join(process.cwd(), asset.localPath.replace(/^api\//, '')) : null,
      asset.localPath ? path.join(process.cwd(), 'apps/api', asset.localPath.replace(/^api\//, '')) : null,
      asset.localPath ? path.join(process.cwd(), 'uploads', path.basename(asset.localPath)) : null,
      asset.localPath ? path.join(process.cwd(), 'apps/api/uploads', path.basename(asset.localPath)) : null,
      asset.whatsappMediaId ? path.join(process.cwd(), 'uploads', `${asset.whatsappMediaId}.jpeg`) : null,
      asset.whatsappMediaId ? path.join(process.cwd(), 'apps/api/uploads', `${asset.whatsappMediaId}.jpeg`) : null,
      asset.whatsappMediaId ? path.join(process.cwd(), 'uploads', `${asset.whatsappMediaId}.mp4`) : null,
      asset.whatsappMediaId ? path.join(process.cwd(), 'apps/api/uploads', `${asset.whatsappMediaId}.mp4`) : null,
    ].filter(Boolean) as string[];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        filePath = cand;
        break;
      }
    }

    if (!filePath) {
      missingCount++;
      continue;
    }

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      const mimeType = asset.mimeType || (filename.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');

      // Upload to R2
      await s3Client.send(new PutObjectCommand({
        Bucket: account1.bucketName,
        Key: filename,
        Body: fileBuffer,
        ContentType: mimeType,
      }));

      const baseUrl = account1.publicUrl.endsWith('/') ? account1.publicUrl.slice(0, -1) : account1.publicUrl;
      const r2Url = `${baseUrl}/${filename}`;

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          originalUrl: r2Url,
          fileSize: fileBuffer.length,
        },
      });

      uploadedCount++;
      console.log(`[${uploadedCount}/${pendingAssets.length}] Uploaded ${filename} (${fileBuffer.length} bytes) -> ${r2Url}`);
    } catch (err: any) {
      console.error(`Failed to upload ${filePath}:`, err.message);
    }
  }

  console.log(`\nSync finished! Uploaded to R2: ${uploadedCount}, Not on local disk: ${missingCount}`);
  await prisma.$disconnect();
}

sync().catch(console.error);
