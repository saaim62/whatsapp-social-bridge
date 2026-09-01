const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const assets = await prisma.mediaAsset.findMany({
    where: { batchId: 'c0ff2afb-541a-427b-82db-691dbff2f329' }
  });
  console.log(assets.map(a => ({ id: a.id, mime: a.mimeType, path: a.localPath, original: a.originalUrl })));
}
run();
