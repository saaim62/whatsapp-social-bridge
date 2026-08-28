const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    data: {
      isEmailVerified: true
    }
  });
  console.log(`Verified ${result.count} users.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
