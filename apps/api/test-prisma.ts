import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:password@localhost:5555/whatsapp_bridge?schema=public' } }
});
async function test() {
  console.log('Connecting...');
  try {
    await prisma.$connect();
    console.log('Connected');
  } catch (err) {
    console.error('Connection failed:', err.message);
  }
}
test();
