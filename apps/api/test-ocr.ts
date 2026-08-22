import { PrismaClient } from '@prisma/client';
import { OcrService } from './src/ai/ocr.service';
import * as path from 'path';

async function testOcr() {
  const prisma = new PrismaClient();
  const mediaList = await prisma.mediaAsset.findMany({
    where: { localPath: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 1
  });

  const ocrService = new OcrService();

  if (mediaList.length > 0) {
    const media = mediaList[0];
    if (media.localPath) {
      const absolutePath = path.join(process.cwd(), media.localPath);
      console.log(`\nTesting media: ${media.id} at ${absolutePath}`);
      
      const brands = await ocrService.detectBrandLogos(absolutePath);
      console.log('Detected brand logos:', brands);
    }
  }

  await prisma.$disconnect();
}

testOcr();
