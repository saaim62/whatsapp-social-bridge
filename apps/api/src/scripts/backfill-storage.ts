import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  console.log('Starting storage backfill...');
  
  const assets = await prisma.mediaAsset.findMany({
    where: { fileSize: 0 }
  });

  console.log(`Found ${assets.length} assets with 0 file size.`);

  let updated = 0;
  for (const asset of assets) {
    if (asset.localPath) {
      const absolutePath = path.join(process.cwd(), asset.localPath.replace(/^api\//, ''));
      if (fs.existsSync(absolutePath)) {
        try {
          const stats = fs.statSync(absolutePath);
          if (stats.size > 0) {
            await prisma.mediaAsset.update({
              where: { id: asset.id },
              data: { fileSize: stats.size }
            });
            updated++;
          }
        } catch (e) {
          console.error(`Error reading file ${absolutePath}`, e);
        }
      }
    }
  }

  console.log(`Backfill complete. Updated ${updated} assets.`);
  await app.close();
}

bootstrap();
