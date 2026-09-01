const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const assets = await prisma.mediaAsset.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log(assets.map(a => ({ id: a.id, mime: a.mimeType, path: a.localPath })));
}
run();
