const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const assets = await prisma.mediaAsset.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log(assets.map(a => ({ id: a.id, batchId: a.batchId, mime: a.mimeType, path: a.localPath })));
}
run();
