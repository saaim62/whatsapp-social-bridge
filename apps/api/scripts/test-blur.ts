import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null });
  const imageBlurQueue = new Queue('image-blur', { connection });

  const sourceImage = '/Users/ibtisamasif/.gemini/antigravity-ide/brain/8a3c001b-9ed9-40bf-9c2d-493265e3f92c/.user_uploaded/media_1787291112700.png';
  const targetImage = path.join(process.cwd(), 'uploads', 'jimmy_choo_test.png');
  
  if (fs.existsSync(sourceImage)) {
    fs.copyFileSync(sourceImage, targetImage);
    console.log(`Copied test image to ${targetImage}`);
  } else {
    console.error('Source image not found at', sourceImage);
    process.exit(1);
  }

  // We need to create a dummy media asset in DB or bypass DB check
  // Wait, ImageBlurProcessor updates the DB:
  // await this.prisma.mediaAsset.update({ where: { id: mediaId }, ... })
  // If the mediaId doesn't exist, it will crash.
  
  // Let's create a dummy record via Prisma first.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  const dummyBatch = await prisma.productBatch.create({
    data: {
      rawText: 'Test batch for MQ',
    }
  });

  const dummyMedia = await prisma.mediaAsset.create({
    data: {
      batchId: dummyBatch.id,
      localPath: 'uploads/jimmy_choo_test.png',
      mimeType: 'image/png',
    }
  });

  console.log(`Created dummy media ID: ${dummyMedia.id}`);

  // 2. Add job
  console.log('Adding job to image-blur queue...');
  await imageBlurQueue.add('blur-image', {
    mediaId: dummyMedia.id,
    localPath: 'uploads/jimmy_choo_test.png',
  });

  console.log('Job added. Watch the NestJS server logs for processing.');
  
  await prisma.$disconnect();
  await connection.quit();
}

main().catch(console.error);
