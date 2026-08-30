const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const assets = await prisma.mediaAsset.findMany({
    where: { fileSize: 0 }
  });

  console.log(`Found ${assets.length} assets with 0 bytes.`);

  let updatedCount = 0;
  for (const asset of assets) {
    if (asset.localPath) {
      try {
        const fullPath = asset.localPath.startsWith('api/') 
          ? path.join(__dirname, '..', 'apps', asset.localPath)
          : path.join(__dirname, '..', 'apps', 'api', asset.localPath);
        const stats = fs.statSync(fullPath);
        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: { fileSize: stats.size }
        });
        updatedCount++;
      } catch (err) {
        // File might not exist locally, just log and skip
        console.warn(`Could not stat file for asset ${asset.id}: ${asset.localPath}`);
      }
    }
  }

  console.log(`Updated ${updatedCount} assets.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
